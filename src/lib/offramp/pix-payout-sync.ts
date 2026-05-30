import '@/lib/server/only';

import { createCorpXAdapterFromEnv } from '@/lib/corpx/adapter';
import { CorpXTransactionNotFoundError } from '@/lib/corpx/errors';
import { OfframpOperationError } from './errors';
import { findOfframpOrderById, markOfframpOrderStatus, type OfframpOrderRow } from './order-store';
import { OFFRAMP_FAILURE_CODES, buildOfframpFailurePatch } from './failure-codes';
import { confirmOfframpPixPayout } from './pix-payout-webhook';

export function shouldSyncOfframpPixPayout(
  order: Pick<OfframpOrderRow, 'status' | 'payout_end_to_end_id'>,
): boolean {
  if (order.status !== 'usdc_received' && order.status !== 'needs_review') {
    return false;
  }

  return Boolean(order.payout_end_to_end_id?.trim());
}

export async function attachOfframpPixPayoutEndToEndId(input: {
  orderId: string;
  endToEndId: string;
}): Promise<OfframpOrderRow> {
  const endToEndId = input.endToEndId.trim();
  if (!endToEndId) {
    throw new OfframpOperationError('endToEndId is required', 400);
  }

  const order = await findOfframpOrderById(input.orderId);
  if (!order) {
    throw new OfframpOperationError('Order not found', 404);
  }

  if (order.payout_end_to_end_id?.trim() === endToEndId) {
    return order;
  }

  const updated = await markOfframpOrderStatus({
    orderId: order.id,
    status: order.status,
    expectedStatus: ['usdc_received', 'needs_review', 'pix_sent'],
    patch: {
      payout_end_to_end_id: endToEndId,
    },
  });

  if (!updated.ok) {
    throw new OfframpOperationError(`Failed to attach payout endToEndId: ${updated.reason}`, 409);
  }

  return updated.row;
}

/**
 * Polls CorpX transfer status when we already have an end-to-end id.
 * Recovers orders stuck after async PIX payout without webhook replay.
 */
export async function syncOfframpPixPayoutFromCorpX(order: OfframpOrderRow): Promise<OfframpOrderRow> {
  if (!shouldSyncOfframpPixPayout(order)) {
    return order;
  }

  const endToEndId = order.payout_end_to_end_id!.trim();
  let adapter;

  try {
    adapter = await createCorpXAdapterFromEnv();
  } catch (error) {
    console.warn('[offramp/pix-sync] CorpX adapter unavailable', {
      orderId: order.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return order;
  }

  let transfer;
  try {
    transfer = await adapter.pix.getTransferStatus(endToEndId);
  } catch (error) {
    if (error instanceof CorpXTransactionNotFoundError) {
      console.info('[offramp/pix-sync] transfer not found yet', { orderId: order.id, endToEndId });
      return order;
    }

    console.warn('[offramp/pix-sync] transfer lookup failed', {
      orderId: order.id,
      endToEndId,
      message: error instanceof Error ? error.message : String(error),
    });
    return order;
  }

  if (transfer.status === 'failed') {
    const reason = 'CorpX reported PIX payout failure during transfer lookup';
    const updated = await markOfframpOrderStatus({
      orderId: order.id,
      status: 'needs_review',
      expectedStatus: ['usdc_received', 'needs_review', 'pix_sent'],
      patch: buildOfframpFailurePatch({
        code: OFFRAMP_FAILURE_CODES.PIX_PAYOUT_FAILED,
        reason,
        needsReview: true,
      }),
    });

    return updated.ok ? updated.row : order;
  }

  if (transfer.status !== 'completed') {
    return order;
  }

  const previousStatus = order.status;
  const promoted = await confirmOfframpPixPayout(order, {
    providerTxId: transfer.providerTxId || order.payout_provider_tx_id,
    endToEndId: transfer.e2eId || endToEndId,
    source: 'offramp/pix-sync',
  });

  if (!promoted) {
    return order;
  }

  if (previousStatus !== 'pix_sent' && promoted.status === 'pix_sent') {
    const { retryOfframpReconciliation } = await import('./reconciliation');
    await retryOfframpReconciliation(promoted.id);
    return (await findOfframpOrderById(promoted.id)) ?? promoted;
  }

  return promoted;
}
