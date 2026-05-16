import type { WebhookProcessingResult } from '@/lib/corpx/webhooks/types';
import { incrementBrhBalanceFromPix } from '@/lib/brh/balance-store';
import { buildMintIdempotencyKey, triggerBrhMintRequest } from '@/lib/brh/mint';

/**
 * When CorpX confirms inbound PIX, credit BRH balance (Supabase) and trigger the mint pipeline (HTTP).
 * Safe to call from the webhook: mint is best-effort and never throws to the caller.
 */
export async function onConfirmedPixInboundSettlement(opts: {
  dedupeKey: string;
  eventType: string;
  payload: unknown;
  result: WebhookProcessingResult;
}): Promise<void> {
  const { result, eventType, payload, dedupeKey } = opts;

  if (result.status !== 'completed' || result.requiresAction !== 'update_balance') {
    return;
  }

  const amountRaw = result.updatedFields?.amount;
  const amount = typeof amountRaw === 'string' ? amountRaw.trim() : '';
  if (!amount) {
    console.warn('[brh/settlement] missing amount on update_balance event', { eventType, dedupeKey });
    return;
  }

  const inc = await incrementBrhBalanceFromPix(amount);
  if (!inc.ok) {
    console.warn('[brh/settlement] balance increment skipped or failed', { eventType, dedupeKey, amount });
  }

  const providerTxId =
    typeof result.providerTxId === 'string' && result.providerTxId.trim()
      ? result.providerTxId.trim()
      : undefined;

  const idempotencyKey = buildMintIdempotencyKey(eventType, providerTxId, payload);

  void triggerBrhMintRequest({
    amount,
    providerTxId,
    eventType,
    idempotencyKey,
    source: 'corpx_pix_inbound',
    rawPayload: payload,
  });
}
