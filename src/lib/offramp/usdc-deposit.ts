import '@/lib/server/only';

import { logOfframpEvent } from '@/lib/fiat-operations/log-offramp';
import { OFFRAMP_FAILURE_CODES, buildOfframpFailurePatch, clearOfframpFailurePatch } from './failure-codes';
import { findOfframpOrderByUsdcDepositExternalId, markOfframpOrderStatus, updateOfframpOrder } from './order-store';
import { isOfframpUsdcDepositExternalId } from './references';
import { retryOfframpReconciliation } from './reconciliation';

export function mapUsdcDepositRampStatusToOfframpStatus(status: string): {
  nextStatus: 'usdc_received' | 'failed' | 'needs_review' | null;
  failureCode: string | null;
} {
  switch (status) {
    case 'confirmed':
    case 'completed':
      return { nextStatus: 'usdc_received', failureCode: null };
    case 'failed':
      return { nextStatus: 'failed', failureCode: OFFRAMP_FAILURE_CODES.USDC_DEPOSIT_CALLBACK_FAILED };
    case 'insufficient_funds':
    case 'needs_review':
    case 'callback_failed':
      return { nextStatus: 'needs_review', failureCode: OFFRAMP_FAILURE_CODES.USDC_DEPOSIT_CALLBACK_FAILED };
    default:
      return { nextStatus: null, failureCode: null };
  }
}

export async function applyOfframpUsdcDepositRampCallback(input: {
  externalId: string;
  rampOperationId: string;
  status: string;
  txHash?: string | null;
  amount?: string | null;
  failureReason?: string | null;
}): Promise<void> {
  if (!isOfframpUsdcDepositExternalId(input.externalId)) return;

  const order = await findOfframpOrderByUsdcDepositExternalId(input.externalId);
  if (!order) {
    console.warn('[offramp/usdc-deposit] callback received for unknown external id', input);
    return;
  }

  const outcome = mapUsdcDepositRampStatusToOfframpStatus(input.status);
  if (!outcome.nextStatus) {
    await updateOfframpOrder({
      orderId: order.id,
      expectedStatus: ['awaiting_deposit', 'needs_review', 'usdc_received'],
      patch: {
        usdc_deposit_ramp_operation_id: input.rampOperationId,
        usdc_received_tx_hash: input.txHash ?? null,
        usdc_received_amount: input.amount ?? null,
      },
    });
    return;
  }

  if (outcome.nextStatus === 'usdc_received') {
    const updated = await markOfframpOrderStatus({
      orderId: order.id,
      status: 'usdc_received',
      expectedStatus: ['awaiting_deposit', 'needs_review', 'usdc_received'],
      patch: {
        usdc_deposit_ramp_operation_id: input.rampOperationId,
        usdc_received_tx_hash: input.txHash ?? null,
        usdc_received_amount: input.amount ?? null,
        ...clearOfframpFailurePatch(),
      },
    });
    if (!updated.ok) return;

    await logOfframpEvent({
      phase: 'usdc_deposit_confirmed',
      status: 'success',
      amountBrl: updated.row.amount_brl,
      correlationId: updated.row.id,
      metadata: {
        source: 'offramp/usdc-deposit-callback',
        external_id: input.externalId,
        tx_hash: input.txHash ?? null,
      },
    });

    try {
      await retryOfframpReconciliation(updated.row.id);
    } catch (error) {
      console.error('[offramp/usdc-deposit] failed to start reconciliation', {
        orderId: updated.row.id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  const failureReason = input.failureReason ?? `Ramp off-ramp deposit returned status "${input.status}".`;
  const updated = await markOfframpOrderStatus({
    orderId: order.id,
    status: outcome.nextStatus,
    expectedStatus: ['awaiting_deposit', 'needs_review', 'failed'],
    patch: {
      usdc_deposit_ramp_operation_id: input.rampOperationId,
      usdc_received_tx_hash: input.txHash ?? null,
      usdc_received_amount: input.amount ?? null,
      ...buildOfframpFailurePatch({
        code: OFFRAMP_FAILURE_CODES.USDC_DEPOSIT_CALLBACK_FAILED,
        reason: failureReason,
        needsReview: outcome.nextStatus === 'needs_review',
      }),
    },
  });
  if (!updated.ok) return;

  await logOfframpEvent({
    phase: 'usdc_deposit_callback',
    status: 'error',
    amountBrl: updated.row.amount_brl,
    correlationId: updated.row.id,
    errorCode: OFFRAMP_FAILURE_CODES.USDC_DEPOSIT_CALLBACK_FAILED,
    errorMessage: failureReason,
    metadata: {
      source: 'offramp/usdc-deposit-callback',
      external_id: input.externalId,
      status: input.status,
    },
  });
}
