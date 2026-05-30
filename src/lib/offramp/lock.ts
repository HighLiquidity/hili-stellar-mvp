import '@/lib/server/only';

import { logOfframpEvent } from '@/lib/fiat-operations/log-offramp';
import { RampApiError } from '@/lib/ramp/client';
import { getRampCallbackUrl, isRampConfigured } from '@/lib/ramp/config';
import { ensureOfframpUsdcDepositOperation } from '@/lib/ramp/offramp-usdc-deposit';
import { OfframpOperationError } from './errors';
import {
  OFFRAMP_FAILURE_CODES,
  clearOfframpFailurePatch,
} from './failure-codes';
import { findOfframpOrderById, lockQuotedOfframpOrderWithDeposit, updateOfframpOrder } from './order-store';
import { buildOfframpUsdcDepositExternalId } from './references';
import type { OfframpLockResponse } from './contracts';
import type { OfframpOrderRow } from './order-store';

function buildLockResponse(row: OfframpOrderRow): OfframpLockResponse {
  return {
    orderId: row.id,
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

export async function lockOfframpQuote(input: { orderId: string }): Promise<OfframpLockResponse> {
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

  const externalId = buildOfframpUsdcDepositExternalId(order.id);
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
      amountUsdc: order.amount_usdc,
    });

    const locked = await lockQuotedOfframpOrderWithDeposit({
      orderId: order.id,
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
      orderId: order.id,
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
      amountBrl: order.amount_brl,
      correlationId: order.id,
      errorCode: OFFRAMP_FAILURE_CODES.USDC_DEPOSIT_SUBMIT_FAILED,
      errorMessage: reason,
      metadata: { source: 'offramp/lock', external_id: externalId },
    });

    throw new OfframpOperationError(reason, error instanceof RampApiError ? error.httpStatus || 502 : 502);
  }
}
