import '@/lib/server/only';

import { logOfframpEvent } from '@/lib/fiat-operations/log-offramp';
import { OFFRAMP_FAILURE_CODES, buildOfframpFailurePatch, clearOfframpFailurePatch } from './failure-codes';
import {
  findOfframpOrderByBrhRedemptionExternalId,
  markOfframpOrderStatus,
  updateOfframpOrder,
} from './order-store';
import { retryOfframpReconciliation } from './reconciliation';
import { isOfframpBrhRedemptionExternalId } from './references';

export function mapBrhRedemptionRampStatusToOfframpStatus(status: string): {
  nextStatus: 'brh_recorded' | 'failed' | 'needs_review' | null;
} {
  switch (status) {
    case 'confirmed':
    case 'completed':
      return { nextStatus: 'brh_recorded' };
    case 'failed':
      return { nextStatus: 'failed' };
    case 'insufficient_funds':
    case 'needs_review':
    case 'callback_failed':
      return { nextStatus: 'needs_review' };
    default:
      return { nextStatus: null };
  }
}

export async function applyOfframpBrhRedemptionRampCallback(input: {
  externalId: string;
  rampOperationId: string;
  status: string;
  failureReason?: string | null;
}): Promise<void> {
  if (!isOfframpBrhRedemptionExternalId(input.externalId)) return;

  const order = await findOfframpOrderByBrhRedemptionExternalId(input.externalId);
  if (!order) {
    console.warn('[offramp/brh-redemption] callback received for unknown external id', input);
    return;
  }

  const outcome = mapBrhRedemptionRampStatusToOfframpStatus(input.status);
  if (!outcome.nextStatus) {
    await updateOfframpOrder({
      orderId: order.id,
      expectedStatus: ['pix_sent', 'needs_review', 'brh_recorded'],
      patch: {
        brh_redemption_external_id: input.externalId,
        brh_redemption_ramp_operation_id: input.rampOperationId,
      },
    });
    return;
  }

  if (outcome.nextStatus === 'brh_recorded') {
    const updated = await markOfframpOrderStatus({
      orderId: order.id,
      status: 'brh_recorded',
      expectedStatus: ['pix_sent', 'needs_review', 'brh_recorded'],
      patch: {
        brh_redemption_external_id: input.externalId,
        brh_redemption_ramp_operation_id: input.rampOperationId,
        ...clearOfframpFailurePatch(),
      },
    });
    if (!updated.ok) return;

    await logOfframpEvent({
      phase: 'brh_record_confirmed',
      status: 'success',
      amountBrl: updated.row.amount_brl,
      correlationId: updated.row.id,
      metadata: {
        source: 'offramp/brh-redemption-callback',
        external_id: input.externalId,
      },
    });

    try {
      await retryOfframpReconciliation(updated.row.id);
    } catch (error) {
      console.error('[offramp/brh-redemption] failed to continue reconciliation', {
        orderId: updated.row.id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  const failureReason =
    input.failureReason ?? `Ramp off-ramp BRH redemption returned status "${input.status}".`;

  const updated = await markOfframpOrderStatus({
    orderId: order.id,
    status: outcome.nextStatus,
    expectedStatus: ['pix_sent', 'needs_review', 'failed', 'brh_recorded'],
    patch: {
      brh_redemption_external_id: input.externalId,
      brh_redemption_ramp_operation_id: input.rampOperationId,
      ...buildOfframpFailurePatch({
        code: OFFRAMP_FAILURE_CODES.BRH_RECORD_FAILED,
        reason: failureReason,
        needsReview: outcome.nextStatus === 'needs_review',
      }),
    },
  });
  if (!updated.ok) return;

  await logOfframpEvent({
    phase: 'brh_record_callback',
    status: 'error',
    amountBrl: updated.row.amount_brl,
    correlationId: updated.row.id,
    errorCode: OFFRAMP_FAILURE_CODES.BRH_RECORD_FAILED,
    errorMessage: failureReason,
    metadata: {
      source: 'offramp/brh-redemption-callback',
      external_id: input.externalId,
      status: input.status,
    },
  });
}
