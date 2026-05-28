import '@/lib/server/only';

import { logOfframpEvent } from '@/lib/fiat-operations/log-offramp';
import { createOfframpOperation, RampApiError } from '@/lib/ramp/client';
import { getRampCallbackUrl, isRampConfigured } from '@/lib/ramp/config';
import {
  findRampOperationByExternalId,
  insertRampOperationPending,
  updateRampOperationAfterCreate,
  updateRampOperationFailed,
} from '@/lib/ramp/operation-store';
import { OfframpOperationError, OfframpValidationError } from './errors';
import {
  OFFRAMP_FAILURE_CODES,
  buildOfframpFailurePatch,
  clearOfframpFailurePatch,
} from './failure-codes';
import { findOfframpOrderById, lockQuotedOfframpOrderWithDeposit, updateOfframpOrder } from './order-store';
import { buildOfframpUsdcDepositExternalId } from './references';
import type { OfframpLockResponse } from './contracts';

function resolveOfframpDepositAddress(): string {
  const address = process.env.ONRAMP_USDC_DISTRIBUTOR_ADDRESS?.trim();
  if (!address) {
    throw new OfframpValidationError('ONRAMP_USDC_DISTRIBUTOR_ADDRESS is required');
  }
  return address;
}

export async function lockOfframpQuote(input: { orderId: string }): Promise<OfframpLockResponse> {
  const order = await findOfframpOrderById(input.orderId);
  if (!order) throw new OfframpOperationError('Order not found', 404);
  if (order.status !== 'quoted') throw new OfframpOperationError('Order is not in quoted state', 409);

  const externalId = buildOfframpUsdcDepositExternalId(order.id);
  const address = resolveOfframpDepositAddress();
  const memo = `offramp:${order.id}`;
  const callbackUrl = getRampCallbackUrl();

  const locked = await lockQuotedOfframpOrderWithDeposit({
    orderId: order.id,
    usdcDepositExternalId: externalId,
    usdcDepositAddress: address,
    usdcDepositMemo: memo,
  });

  if (!locked.ok) {
    throw new OfframpOperationError(locked.reason);
  }

  if (!isRampConfigured()) {
    await updateOfframpOrder({
      orderId: order.id,
      expectedStatus: 'awaiting_deposit',
      patch: buildOfframpFailurePatch({
        code: OFFRAMP_FAILURE_CODES.USDC_DEPOSIT_SUBMIT_FAILED,
        reason: 'Ramp API is not configured for off-ramp deposit instruction.',
      }),
    });
  } else if (!callbackUrl?.startsWith('https://')) {
    await updateOfframpOrder({
      orderId: order.id,
      expectedStatus: 'awaiting_deposit',
      patch: buildOfframpFailurePatch({
        code: OFFRAMP_FAILURE_CODES.USDC_DEPOSIT_SUBMIT_FAILED,
        reason: 'callbackUrl must be HTTPS.',
      }),
    });
  } else {
    const existing = await findRampOperationByExternalId(externalId);
    if (!existing) {
      const pending = await insertRampOperationPending({
        externalId,
        operationType: 'offramp',
        status: 'pending_local',
        amount: locked.row.amount_usdc,
        destination: address,
        memo,
      });

      if (!pending.ok) {
        await updateOfframpOrder({
          orderId: order.id,
          expectedStatus: 'awaiting_deposit',
          patch: buildOfframpFailurePatch({
            code: OFFRAMP_FAILURE_CODES.USDC_DEPOSIT_SUBMIT_FAILED,
            reason: `Failed to persist pending off-ramp operation: ${pending.reason}`,
          }),
        });
      }
    }

    try {
      if (!existing?.ramp_operation_id) {
        const created = await createOfframpOperation({
          amount: locked.row.amount_usdc,
          externalId,
          callbackUrl,
        });

        await updateRampOperationAfterCreate({
          externalId,
          rampOperationId: created.id,
          status: created.status,
        });

        await updateOfframpOrder({
          orderId: order.id,
          expectedStatus: 'awaiting_deposit',
          patch: {
            usdc_deposit_ramp_operation_id: created.id,
            ...clearOfframpFailurePatch(),
          },
        });

        await logOfframpEvent({
          phase: 'usdc_deposit_submit',
          status: 'success',
          amountBrl: locked.row.amount_brl,
          correlationId: locked.row.id,
          metadata: {
            source: 'offramp/lock',
            external_id: externalId,
            ramp_operation_id: created.id,
          },
        });
      }
    } catch (error) {
      const reason =
        error instanceof RampApiError ? `${error.code}: ${error.message}` : error instanceof Error ? error.message : String(error);

      await updateRampOperationFailed({
        externalId,
        status: 'failed',
        failureReason: reason,
      });
      await updateOfframpOrder({
        orderId: order.id,
        expectedStatus: 'awaiting_deposit',
        patch: buildOfframpFailurePatch({
          code: OFFRAMP_FAILURE_CODES.USDC_DEPOSIT_SUBMIT_FAILED,
          reason,
        }),
      });
      await logOfframpEvent({
        phase: 'usdc_deposit_submit',
        status: 'error',
        amountBrl: locked.row.amount_brl,
        correlationId: locked.row.id,
        errorCode: OFFRAMP_FAILURE_CODES.USDC_DEPOSIT_SUBMIT_FAILED,
        errorMessage: reason,
        metadata: { source: 'offramp/lock', external_id: externalId },
      });
    }
  }

  return {
    orderId: locked.row.id,
    status: 'awaiting_deposit',
    quote: {
      symbol: locked.row.quote_symbol,
      side: locked.row.quote_side,
      amountUsdc: locked.row.amount_usdc,
      amountBrl: locked.row.amount_brl,
      rate: locked.row.quote_rate,
      expiresAt: locked.row.quote_expires_at,
    },
    payout: {
      key: locked.row.payout_pix_key,
      beneficiaryName: locked.row.payout_beneficiary_name,
    },
    deposit: {
      externalId: locked.row.usdc_deposit_external_id ?? externalId,
      address: locked.row.usdc_deposit_address ?? address,
      memo: locked.row.usdc_deposit_memo ?? memo,
    },
  };
}
