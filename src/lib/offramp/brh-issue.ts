import '@/lib/server/only';

import { logOfframpEvent } from '@/lib/fiat-operations/log-offramp';
import { OFFRAMP_FAILURE_CODES, buildOfframpFailurePatch, clearOfframpFailurePatch } from './failure-codes';
import { isOfframpBrhIssueCompleted } from './brh-lifecycle';
import {
  findOfframpOrderByBrhIssueExternalId,
  markOfframpOrderStatus,
  updateOfframpOrder,
} from './order-store';
import { isOfframpBrhIssueExternalId } from './references';

export function mapBrhIssueRampStatusToOfframpPatch(status: string): {
  patchOnly: boolean;
  failureCode: string | null;
  issueCompleted: boolean;
} {
  switch (status) {
    case 'confirmed':
    case 'completed':
      return { patchOnly: true, failureCode: null, issueCompleted: true };
    case 'failed':
      return { patchOnly: false, failureCode: OFFRAMP_FAILURE_CODES.BRH_RECORD_FAILED, issueCompleted: false };
    case 'insufficient_funds':
    case 'needs_review':
    case 'callback_failed':
      return { patchOnly: false, failureCode: OFFRAMP_FAILURE_CODES.BRH_RECORD_FAILED, issueCompleted: false };
    default:
      return { patchOnly: true, failureCode: null, issueCompleted: false };
  }
}

export async function applyOfframpBrhIssueRampCallback(input: {
  externalId: string;
  rampOperationId: string;
  status: string;
  failureReason?: string | null;
}): Promise<void> {
  if (!isOfframpBrhIssueExternalId(input.externalId)) return;

  const order = await findOfframpOrderByBrhIssueExternalId(input.externalId);
  if (!order) {
    console.warn('[offramp/brh-issue] callback received for unknown external id', input);
    return;
  }

  const outcome = mapBrhIssueRampStatusToOfframpPatch(input.status);
  if (outcome.patchOnly && outcome.failureCode == null && !outcome.issueCompleted) {
    await updateOfframpOrder({
      orderId: order.id,
      expectedStatus: ['pix_sent', 'needs_review', 'brh_recorded'],
      patch: {
        brh_issue_external_id: input.externalId,
        brh_issue_ramp_operation_id: input.rampOperationId,
      },
    });
    return;
  }

  if (outcome.issueCompleted) {
    const updated = await updateOfframpOrder({
      orderId: order.id,
      expectedStatus: ['pix_sent', 'needs_review', 'brh_recorded'],
      patch: {
        brh_issue_external_id: input.externalId,
        brh_issue_ramp_operation_id: input.rampOperationId,
        ...clearOfframpFailurePatch(),
      },
    });

    if (!updated.ok) {
      console.error('[offramp/brh-issue] failed to persist confirmed issue', {
        orderId: order.id,
        externalId: input.externalId,
        reason: updated.reason,
      });
      return;
    }

    await logOfframpEvent({
      phase: 'brh_issue_confirmed',
      status: 'success',
      amountBrl: updated.row.amount_brl,
      correlationId: updated.row.id,
      metadata: {
        source: 'offramp/brh-issue-callback',
        external_id: input.externalId,
        ramp_operation_id: input.rampOperationId,
      },
    });

    try {
      const { retryOfframpReconciliation } = await import('./reconciliation');
      await retryOfframpReconciliation(updated.row.id);
    } catch (error) {
      console.error('[offramp/brh-issue] failed to continue reconciliation after issue confirmation', {
        orderId: updated.row.id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (outcome.failureCode) {
    const failureReason = input.failureReason ?? `Ramp BRH issue returned status "${input.status}".`;
    await markOfframpOrderStatus({
      orderId: order.id,
      status: 'needs_review',
      expectedStatus: ['pix_sent', 'needs_review', 'brh_recorded'],
      patch: {
        brh_issue_external_id: input.externalId,
        brh_issue_ramp_operation_id: input.rampOperationId,
        ...buildOfframpFailurePatch({
          code: OFFRAMP_FAILURE_CODES.BRH_RECORD_FAILED,
          reason: failureReason,
          needsReview: true,
        }),
      },
    });

    await logOfframpEvent({
      phase: 'brh_issue_callback',
      status: 'error',
      amountBrl: order.amount_brl,
      correlationId: order.id,
      errorCode: OFFRAMP_FAILURE_CODES.BRH_RECORD_FAILED,
      errorMessage: failureReason,
      metadata: {
        source: 'offramp/brh-issue-callback',
        external_id: input.externalId,
        status: input.status,
      },
    });
  }
}

export { isOfframpBrhIssueCompleted };
