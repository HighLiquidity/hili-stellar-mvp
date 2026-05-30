import '@/lib/server/only';

import { normalizeCorpXPixIdentifier } from '@/lib/corpx/pix/identifier';
import type { WebhookProcessingResult } from '@/lib/corpx/webhooks/types';
import { unwrapWebhookPayload, pickString, jsonNumberToAmountString } from '@/lib/corpx/webhooks/payload-fields';
import { logOfframpEvent } from '@/lib/fiat-operations/log-offramp';
import {
  OFFRAMP_FAILURE_CODES,
  buildOfframpFailurePatch,
  clearOfframpFailurePatch,
} from './failure-codes';
import {
  findOfframpOrderById,
  findOfframpOrderByPayoutEndToEndId,
  findOfframpOrderByPayoutProviderTxId,
  markOfframpOrderStatus,
  type OfframpOrderRow,
} from './order-store';
import {
  buildOfframpPixPayoutReference,
  parseOfframpPixPayoutReference,
} from './references';
import { retryOfframpReconciliation } from './reconciliation';

export type OutboundPixSettlementContext = {
  dedupeKey: string;
  eventType: string;
  payload: unknown;
  result: WebhookProcessingResult;
};

function compactOrderId(orderId: string): string {
  return orderId.replace(/-/g, '').toLowerCase();
}

export function orderIdMatchesCorpXPixIdentifier(orderId: string, identifier: string): boolean {
  const compact = compactOrderId(orderId);
  const normalized = identifier.trim().toLowerCase();
  if (!normalized) return false;

  if (normalized === orderId.trim().toLowerCase()) return true;
  if (normalized === compact) return true;
  if (normalized === `o${compact}`) return true;

  try {
    const fromNormalized = normalizeCorpXPixIdentifier(orderId);
    if (normalized === fromNormalized.toLowerCase()) return true;
  } catch {
    // ignore invalid identifier input
  }

  if (compact.startsWith(normalized) && normalized.length >= 24) return true;
  return false;
}

async function findOfframpOrderByPixCorrelationIdentifier(identifier: string): Promise<OfframpOrderRow | null> {
  const parsedOrderId = parseOfframpPixPayoutReference(identifier);
  if (parsedOrderId) {
    return findOfframpOrderById(parsedOrderId);
  }

  const adminOrderId = identifier.trim();
  if (/^[0-9a-f-]{32,36}$/i.test(adminOrderId)) {
    const byId = await findOfframpOrderById(adminOrderId);
    if (byId) return byId;
  }

  return null;
}

export async function resolveOfframpOrderFromPixOutWebhook(input: {
  payload: unknown;
  result: WebhookProcessingResult;
}): Promise<OfframpOrderRow | null> {
  const data = unwrapWebhookPayload(input.payload);
  const providerTxId =
    input.result.providerTxId ??
    pickString(data, 'transactionId', 'transaction_id', 'bigPixId', 'paymentId') ??
    '';
  const endToEndId =
    pickString(data, 'endToEndId', 'end_to_end_id', 'e2eId') ??
    (typeof input.result.updatedFields?.end_to_end_id === 'string'
      ? input.result.updatedFields.end_to_end_id
      : '') ??
    '';
  const identifier =
    pickString(data, 'identifier', 'correlationId', 'correlation_id') ??
    (typeof input.result.updatedFields?.identifier === 'string'
      ? input.result.updatedFields.identifier
      : '') ??
    '';
  const description =
    pickString(data, 'description', 'reference', 'memo') ??
    (typeof input.result.updatedFields?.description === 'string'
      ? input.result.updatedFields.description
      : '') ??
    '';

  if (providerTxId) {
    const byProviderTx = await findOfframpOrderByPayoutProviderTxId(providerTxId);
    if (byProviderTx) return byProviderTx;
  }

  if (endToEndId) {
    const byE2e = await findOfframpOrderByPayoutEndToEndId(endToEndId);
    if (byE2e) return byE2e;
  }

  const referenceOrderId = parseOfframpPixPayoutReference(description);
  if (referenceOrderId) {
    const byReference = await findOfframpOrderById(referenceOrderId);
    if (byReference) return byReference;
  }

  if (identifier) {
    const byIdentifier = await findOfframpOrderByPixCorrelationIdentifier(identifier);
    if (byIdentifier && orderIdMatchesCorpXPixIdentifier(byIdentifier.id, identifier)) {
      return byIdentifier;
    }
  }

  return null;
}

async function markPixSentFromWebhook(order: OfframpOrderRow, input: {
  providerTxId: string | null;
  endToEndId: string | null;
  payoutReference: string;
  source?: string;
}): Promise<OfframpOrderRow | null> {
  if (order.status === 'pix_sent' || order.status === 'brh_recorded' || order.status === 'fx_settled' || order.status === 'complete') {
    if (!input.providerTxId && !input.endToEndId) {
      return order;
    }

    const patched = await markOfframpOrderStatus({
      orderId: order.id,
      status: order.status,
      expectedStatus: ['pix_sent', 'brh_recorded', 'fx_settled', 'complete', 'needs_review'],
      patch: {
        payout_provider_tx_id: input.providerTxId ?? order.payout_provider_tx_id,
        payout_end_to_end_id: input.endToEndId ?? order.payout_end_to_end_id,
        payout_reference: order.payout_reference ?? input.payoutReference,
      },
    });

    return patched.ok ? patched.row : order;
  }

  const updated = await markOfframpOrderStatus({
    orderId: order.id,
    status: 'pix_sent',
    expectedStatus: ['usdc_received', 'needs_review', 'pix_sent'],
    patch: {
      payout_provider_tx_id: input.providerTxId,
      payout_end_to_end_id: input.endToEndId,
      payout_reference: order.payout_reference ?? input.payoutReference,
      ...clearOfframpFailurePatch(),
    },
  });

  if (!updated.ok) {
    console.error('[offramp/pix-webhook] failed to mark pix_sent', {
      orderId: order.id,
      reason: updated.reason,
    });
    return null;
  }

  await logOfframpEvent({
    phase: 'pix_payout_webhook',
    status: 'success',
    amountBrl: updated.row.amount_brl,
    correlationId: updated.row.id,
    providerTxId: input.providerTxId ?? undefined,
    metadata: {
      source: input.source ?? 'offramp/pix-webhook',
      order_id: updated.row.id,
      e2e_id: input.endToEndId,
    },
  });

  return updated.row;
}

/** Promotes an off-ramp order to `pix_sent` after CorpX confirms the outbound PIX. */
export async function confirmOfframpPixPayout(
  order: OfframpOrderRow,
  input: {
    providerTxId?: string | null;
    endToEndId?: string | null;
    source?: string;
  },
): Promise<OfframpOrderRow | null> {
  const payoutReference = order.payout_reference ?? buildOfframpPixPayoutReference(order.id);
  return markPixSentFromWebhook(order, {
    providerTxId: input.providerTxId ?? null,
    endToEndId: input.endToEndId ?? null,
    payoutReference,
    source: input.source,
  });
}

/**
 * Confirms off-ramp PIX payout after CorpX `pix.out.completed` / `pix.out.failed` webhooks.
 * Recovers orders stuck at `usdc_received` when cash-out was accepted asynchronously by CorpX.
 */
export async function settleOutboundPixFromWebhook(ctx: OutboundPixSettlementContext): Promise<boolean> {
  const { result, eventType, payload, dedupeKey } = ctx;
  const action = result.requiresAction;

  if (action !== 'mark_settlement_complete' && action !== 'mark_settlement_failed') {
    return false;
  }

  const order = await resolveOfframpOrderFromPixOutWebhook({ payload, result });
  if (!order) {
    console.warn('[offramp/pix-webhook] no matching off-ramp order', {
      eventType,
      dedupeKey,
      providerTxId: result.providerTxId ?? null,
    });
    return false;
  }

  const data = unwrapWebhookPayload(payload);
  const providerTxId =
    result.providerTxId ??
    pickString(data, 'transactionId', 'transaction_id', 'bigPixId', 'paymentId') ??
    null;
  const endToEndId = pickString(data, 'endToEndId', 'end_to_end_id', 'e2eId') ?? null;

  const webhookAmount = jsonNumberToAmountString(result.updatedFields?.amount ?? data.amount);
  if (webhookAmount && webhookAmount !== order.amount_brl) {
    console.warn('[offramp/pix-webhook] payout amount mismatch', {
      orderId: order.id,
      expected: order.amount_brl,
      received: webhookAmount,
      dedupeKey,
    });
  }

  if (action === 'mark_settlement_failed') {
    const reason =
      result.errorMessage ??
      pickString(data, 'errorMessage', 'error_message', 'message') ??
      'CorpX reported PIX payout failure';

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

    if (!updated.ok) {
      console.error('[offramp/pix-webhook] failed to mark payout failure', {
        orderId: order.id,
        reason: updated.reason,
      });
      return false;
    }

    await logOfframpEvent({
      phase: 'pix_payout_webhook',
      status: 'error',
      amountBrl: order.amount_brl,
      correlationId: order.id,
      errorCode: OFFRAMP_FAILURE_CODES.PIX_PAYOUT_FAILED,
      errorMessage: reason,
      metadata: { source: 'offramp/pix-webhook', order_id: order.id, dedupe_key: dedupeKey },
    });

    return true;
  }

  const promoted = await confirmOfframpPixPayout(order, {
    providerTxId,
    endToEndId,
    source: 'offramp/pix-webhook',
  });

  if (!promoted) {
    return false;
  }

  await retryOfframpReconciliation(promoted.id);
  return true;
}
