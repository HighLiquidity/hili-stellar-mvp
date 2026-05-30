import '@/lib/server/only';

import { deleteRampOperationByExternalId } from '@/lib/ramp/operation-store';
import { isOfframpBrhIssueCompleted } from './brh-lifecycle';
import { OfframpOperationError } from './errors';
import { clearOfframpFailurePatch } from './failure-codes';
import { resolveOfframpBrhIssueRampStatus, resolveOfframpBrhRedemptionRampStatus } from './brh-record';
import { findOfframpOrderById, markOfframpOrderStatus } from './order-store';
import {
  buildOfframpBrhRedemptionExternalId,
  buildOfframpBrhRedemptionRetryExternalId,
} from './references';
import { retryOfframpReconciliation } from './reconciliation';

const RETRYABLE_BRH_REDEMPTION_STATUSES = new Set([
  'needs_review',
  'failed',
  'callback_failed',
  'insufficient_funds',
]);

/**
 * Drops the failed local BRH redemption attempt and prepares a fresh external id
 * so Ramp receives a new burn after mint (issue) is already confirmed.
 */
export async function resetOfframpBrhRedemptionForRetry(orderId: string): Promise<{
  orderId: string;
  previousRedemptionExternalId: string;
  nextRedemptionExternalId: string;
}> {
  const order = await findOfframpOrderById(orderId.trim());
  if (!order) {
    throw new OfframpOperationError('Order not found', 404);
  }

  if (!order.payout_provider_tx_id) {
    throw new OfframpOperationError('PIX payout must be recorded before retrying BRH redemption.', 409);
  }

  const issueStatus = await resolveOfframpBrhIssueRampStatus(order);
  if (!isOfframpBrhIssueCompleted(issueStatus)) {
    throw new OfframpOperationError(
      'BRH issue (mint) must be confirmed before retrying redemption (burn).',
      409,
    );
  }

  const previousRedemptionExternalId =
    order.brh_redemption_external_id ?? buildOfframpBrhRedemptionExternalId(order.id);
  const redemptionStatus = await resolveOfframpBrhRedemptionRampStatus(order);

  if (
    redemptionStatus &&
    !RETRYABLE_BRH_REDEMPTION_STATUSES.has(redemptionStatus) &&
    order.status !== 'needs_review'
  ) {
    throw new OfframpOperationError(
      `BRH redemption is "${redemptionStatus}" and cannot be reset from the app.`,
      409,
    );
  }

  const deleted = await deleteRampOperationByExternalId(previousRedemptionExternalId);
  if (!deleted.ok) {
    throw new OfframpOperationError(`Failed to clear local BRH redemption operation: ${deleted.reason}`, 500);
  }

  const nextRedemptionExternalId = buildOfframpBrhRedemptionRetryExternalId(order.id);
  const updated = await markOfframpOrderStatus({
    orderId: order.id,
    status: 'pix_sent',
    expectedStatus: ['pix_sent', 'needs_review', 'brh_recorded'],
    patch: {
      brh_redemption_external_id: nextRedemptionExternalId,
      brh_redemption_ramp_operation_id: null,
      ...clearOfframpFailurePatch(),
    },
  });

  if (!updated.ok) {
    throw new OfframpOperationError(`Failed to prepare BRH redemption retry: ${updated.reason}`, 409);
  }

  await retryOfframpReconciliation(updated.row.id);

  return {
    orderId: updated.row.id,
    previousRedemptionExternalId,
    nextRedemptionExternalId,
  };
}
