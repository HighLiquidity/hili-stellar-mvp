import '@/lib/server/only';

import { getRampOperation } from '@/lib/ramp/client';
import { isRampConfigured } from '@/lib/ramp/config';
import { applyOfframpBrhIssueRampCallback } from './brh-issue';
import { applyOfframpBrhRedemptionRampCallback } from './brh-redemption';
import { isOfframpBrhIssueCompleted } from './brh-lifecycle';
import { resolveOfframpBrhIssueRampStatus } from './brh-record';
import { findOfframpOrderById, type OfframpOrderRow } from './order-store';

const TERMINAL_BRH_REDEMPTION_RAMP_STATUSES = new Set([
  'confirmed',
  'completed',
  'failed',
  'needs_review',
  'insufficient_funds',
  'callback_failed',
]);

export function shouldSyncOfframpBrhIssue(
  order: Pick<OfframpOrderRow, 'status' | 'brh_issue_external_id' | 'brh_issue_ramp_operation_id'>,
): boolean {
  if (order.status !== 'pix_sent' && order.status !== 'needs_review') {
    return false;
  }

  return Boolean(order.brh_issue_external_id?.trim() && order.brh_issue_ramp_operation_id?.trim());
}

export function shouldSyncOfframpBrhRedemption(
  order: Pick<
    OfframpOrderRow,
    'status' | 'brh_redemption_external_id' | 'brh_redemption_ramp_operation_id'
  >,
): boolean {
  if (order.status !== 'pix_sent' && order.status !== 'needs_review') {
    return false;
  }

  return Boolean(
    order.brh_redemption_external_id?.trim() && order.brh_redemption_ramp_operation_id?.trim(),
  );
}

export async function syncOfframpBrhIssueFromRamp(order: OfframpOrderRow): Promise<OfframpOrderRow> {
  if (!shouldSyncOfframpBrhIssue(order) || !isRampConfigured()) {
    return order;
  }

  const externalId = order.brh_issue_external_id!.trim();
  const rampOperationId = order.brh_issue_ramp_operation_id!.trim();

  try {
    const document = await getRampOperation(rampOperationId);
    const status = document.status?.trim() || '';
    const failureReason = document.failureReason?.trim() || null;

    if (!status) {
      return order;
    }

    await applyOfframpBrhIssueRampCallback({
      externalId,
      rampOperationId: document.id,
      status,
      failureReason,
    });
  } catch (error) {
    console.warn('[offramp/brh-sync] failed to sync BRH issue from Ramp API', {
      orderId: order.id,
      rampOperationId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  return (await findOfframpOrderById(order.id)) ?? order;
}

export async function syncOfframpBrhRedemptionFromRamp(order: OfframpOrderRow): Promise<OfframpOrderRow> {
  const issueStatus = await resolveOfframpBrhIssueRampStatus(order);
  if (!isOfframpBrhIssueCompleted(issueStatus)) {
    return order;
  }

  if (!shouldSyncOfframpBrhRedemption(order) || !isRampConfigured()) {
    return order;
  }

  const externalId = order.brh_redemption_external_id!.trim();
  const rampOperationId = order.brh_redemption_ramp_operation_id!.trim();

  try {
    const document = await getRampOperation(rampOperationId);
    const status = document.status?.trim() || '';
    const failureReason = document.failureReason?.trim() || null;

    if (!status) {
      return order;
    }

    if (!TERMINAL_BRH_REDEMPTION_RAMP_STATUSES.has(status)) {
      await applyOfframpBrhRedemptionRampCallback({
        externalId,
        rampOperationId: document.id,
        status,
        failureReason,
      });
      return (await findOfframpOrderById(order.id)) ?? order;
    }

    await applyOfframpBrhRedemptionRampCallback({
      externalId,
      rampOperationId: document.id,
      status,
      failureReason,
    });
  } catch (error) {
    console.warn('[offramp/brh-sync] failed to sync BRH redemption from Ramp API', {
      orderId: order.id,
      rampOperationId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  return (await findOfframpOrderById(order.id)) ?? order;
}

/** Syncs BRH issue first, then redemption only after mint is confirmed on the omnibus. */
export async function syncOfframpBrhRecordFromRamp(order: OfframpOrderRow): Promise<OfframpOrderRow> {
  let current = order;

  if (shouldSyncOfframpBrhIssue(current)) {
    current = await syncOfframpBrhIssueFromRamp(current);
  }

  const issueStatus = await resolveOfframpBrhIssueRampStatus(current);
  if (!isOfframpBrhIssueCompleted(issueStatus)) {
    return current;
  }

  if (shouldSyncOfframpBrhRedemption(current)) {
    current = await syncOfframpBrhRedemptionFromRamp(current);
  }

  return current;
}

export function shouldContinueOfframpReconciliationOnRead(
  status: OfframpOrderRow['status'],
): boolean {
  return status === 'pix_sent' || status === 'brh_recorded' || status === 'fx_settled';
}
