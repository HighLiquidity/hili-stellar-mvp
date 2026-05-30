import '@/lib/server/only';

import { logOfframpEvent } from '@/lib/fiat-operations/log-offramp';
import { OFFRAMP_FAILURE_CODES, buildOfframpFailurePatch, clearOfframpFailurePatch } from './failure-codes';
import {
  findOfframpOrderByBrhIssueExternalId,
  markOfframpOrderStatus,
  updateOfframpOrder,
} from './order-store';
import { isOfframpBrhIssueExternalId } from './references';

export function mapBrhIssueRampStatusToOfframpPatch(status: string): {
  patchOnly: boolean;
  failureCode: string | null;
} {
  switch (status) {
    case 'confirmed':
      return { patchOnly: true, failureCode: null };
    case 'failed':
      return { patchOnly: false, failureCode: OFFRAMP_FAILURE_CODES.BRH_RECORD_FAILED };
    case 'insufficient_funds':
    case 'needs_review':
    case 'callback_failed':
      return { patchOnly: false, failureCode: OFFRAMP_FAILURE_CODES.BRH_RECORD_FAILED };
    default:
      return { patchOnly: true, failureCode: null };
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
  if (outcome.patchOnly && outcome.failureCode == null) {
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
