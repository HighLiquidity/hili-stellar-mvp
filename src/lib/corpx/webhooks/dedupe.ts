import { createHash } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

import { pickString, unwrapWebhookPayload } from './payload-fields';

/**
 * Stable idempotency key: prefers CorpX `Idempotency-Key` / `X-Webhook-ID`, then business ids, then body hash.
 */
export function buildCorpXWebhookDedupeKey(
  headers: Headers,
  eventType: string,
  payload: unknown,
  rawBody: string,
): string {
  const idem = headers.get('idempotency-key') ?? headers.get('x-webhook-id');
  if (idem?.trim()) return `corpx:hdr:${idem.trim()}`;

  const data = unwrapWebhookPayload(payload);
  const txid = pickString(data, 'txid', 'txId');
  if (txid) return `corpx:${eventType}:txid:${txid}`;
  const tx = pickString(data, 'transactionId', 'transaction_id');
  const e2e = pickString(data, 'endToEndId', 'end_to_end_id');
  if (tx) return `corpx:${eventType}:tx:${tx}`;
  if (e2e) return `corpx:${eventType}:e2e:${e2e}`;

  const hash = createHash('sha256').update(rawBody).digest('hex');
  return `corpx:${eventType}:sha256:${hash}`;
}

/**
 * Returns `true` if this delivery should be processed, `false` if it was already recorded.
 * If `SUPABASE_SERVICE_ROLE_KEY` is not set, always returns `true` (no persistence — dev only).
 *
 * Table: `corpx_webhook_dedup` (see migration 20250516170000_deposit_charges_corpx_dedup.sql).
 */
export async function claimCorpXWebhookDedupe(dedupeKey: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return true;

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.from('corpx_webhook_dedup').insert({ id: dedupeKey });
  if (!error) return true;

  const code = (error as { code?: string }).code;
  if (code === '23505') return false;

  throw error;
}
