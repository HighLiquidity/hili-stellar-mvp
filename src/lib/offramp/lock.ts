import '@/lib/server/only';

import { logOfframpEvent } from '@/lib/fiat-operations/log-offramp';
import { isOfframpQuotePlaceholderPixKey } from '@/lib/ramp/quote-placeholders';
import { RampApiError } from '@/lib/ramp/client';
import { getRampCallbackUrl, isRampConfigured } from '@/lib/ramp/config';
import { ensureOfframpUsdcDepositOperation } from '@/lib/ramp/offramp-usdc-deposit';
import type { PanelUserRole } from '@/lib/users/types';
import { OfframpOperationError } from './errors';
import {
  OFFRAMP_FAILURE_CODES,
  clearOfframpFailurePatch,
} from './failure-codes';
import { findOfframpOrderById, lockQuotedOfframpOrderWithDeposit, updateOfframpOrder } from './order-store';
import { buildOfframpUsdcDepositExternalId } from './references';
import { resolveWhitelistedOfframpPayout } from './whitelist-lock';
import type { OfframpLockResponse } from './contracts';
import type { OfframpOrderRow } from './order-store';

function buildLockResponse(row: OfframpOrderRow): OfframpLockResponse {
  return {
    orderId: row.id,
    externalId: row.integrator_external_id,
    status: 'awaiting_deposit',
    quote: {
      symbol: row.quote_symbol,
      side: row.quote_side,
      amountUsdc: row.amount_usdc,
      amountBrl: row.amount_brl,
      rate: row.quote_rate,
      expiresAt: row.quote_expires_at,
    },
    payout: {
      key: row.payout_pix_key,
      beneficiaryName: row.payout_beneficiary_name,
    },
    deposit: {
      externalId: row.usdc_deposit_external_id ?? '',
      address: row.usdc_deposit_address ?? '',
      memo: row.usdc_deposit_memo,
      expiresAt: row.usdc_deposit_expires_at,
    },
  };
}

export type LockOfframpQuoteInput = {
  orderId: string;
  actor: {
    userId: string;
    role: PanelUserRole;
  };
  payoutPixKey?: string;
  payoutBeneficiaryName?: string | null;
};

export async function lockOfframpQuote(input: LockOfframpQuoteInput): Promise<OfframpLockResponse> {
  const order = await findOfframpOrderById(input.orderId);
  if (!order) throw new OfframpOperationError('Order not found', 404);

  if (order.status === 'awaiting_deposit') {
    if (!order.usdc_deposit_address || !order.usdc_deposit_memo) {
      throw new OfframpOperationError('Order is awaiting deposit but deposit instructions are incomplete.', 409);
    }
    return buildLockResponse(order);
  }

  if (order.status !== 'quoted') {
    throw new OfframpOperationError('Order is not in quoted state', 409);
  }

  const requestedPixKey = input.payoutPixKey?.trim() || order.payout_pix_key;
  const whitelistedPayout = await resolveWhitelistedOfframpPayout({
    role: input.actor.role,
    userId: input.actor.userId,
    payoutPixKey: requestedPixKey,
    payoutBeneficiaryName: input.payoutBeneficiaryName ?? order.payout_beneficiary_name,
  });

  let orderForLock = order;
  const payoutChanged =
    orderForLock.payout_pix_key !== whitelistedPayout.pixKey ||
    orderForLock.payout_beneficiary_name !== whitelistedPayout.beneficiaryName ||
    isOfframpQuotePlaceholderPixKey(orderForLock.payout_pix_key);

  if (payoutChanged) {
    const updated = await updateOfframpOrder({
      orderId: order.id,
      expectedStatus: 'quoted',
      patch: {
        payout_pix_key: whitelistedPayout.pixKey,
        payout_beneficiary_name: whitelistedPayout.beneficiaryName,
      },
    });

    if (!updated.ok) {
      throw new OfframpOperationError(`Failed to update off-ramp payout before lock: ${updated.reason}`, 409);
    }

    orderForLock = updated.row;
  }

  const externalId = buildOfframpUsdcDepositExternalId(orderForLock.id);
  const callbackUrl = getRampCallbackUrl();

  if (!isRampConfigured()) {
    throw new OfframpOperationError('Ramp API is not configured for off-ramp deposit instruction.', 503);
  }

  if (!callbackUrl?.startsWith('https://')) {
    throw new OfframpOperationError('Ramp callbackUrl must be HTTPS.', 503);
  }

  try {
    const depositOperation = await ensureOfframpUsdcDepositOperation({
      externalId,
      callbackUrl,
      amountUsdc: orderForLock.amount_usdc,
    });

    const locked = await lockQuotedOfframpOrderWithDeposit({
      orderId: orderForLock.id,
      usdcDepositExternalId: externalId,
      usdcDepositAddress: depositOperation.depositAddress,
      usdcDepositMemo: depositOperation.memo,
      usdcDepositExpiresAt: depositOperation.expiresAt,
      usdcDepositRampOperationId: depositOperation.rampOperationId,
    });

    if (!locked.ok) {
      throw new OfframpOperationError(locked.reason);
    }

    await updateOfframpOrder({
      orderId: orderForLock.id,
      expectedStatus: 'awaiting_deposit',
      patch: clearOfframpFailurePatch(),
    });

    await logOfframpEvent({
      phase: 'usdc_deposit_submit',
      status: 'success',
      amountBrl: locked.row.amount_brl,
      correlationId: locked.row.id,
      metadata: {
        source: 'offramp/lock',
        external_id: externalId,
        ramp_operation_id: depositOperation.rampOperationId,
        deposit_expires_at: depositOperation.expiresAt,
      },
    });

    return buildLockResponse(locked.row);
  } catch (error) {
    const reason =
      error instanceof RampApiError ? `${error.code}: ${error.message}` : error instanceof Error ? error.message : String(error);

    await logOfframpEvent({
      phase: 'usdc_deposit_submit',
      status: 'error',
      amountBrl: orderForLock.amount_brl,
      correlationId: orderForLock.id,
      errorCode: OFFRAMP_FAILURE_CODES.USDC_DEPOSIT_SUBMIT_FAILED,
      errorMessage: reason,
      metadata: { source: 'offramp/lock', external_id: externalId },
    });

    throw new OfframpOperationError(reason, error instanceof RampApiError ? error.httpStatus || 502 : 502);
  }
}
