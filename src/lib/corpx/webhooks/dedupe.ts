import { createHash } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

/** Unwraps `payload.data` when the handler receives a nested envelope. */
function unwrapPayloadRecord(payload: unknown): Record<string, unknown> {
  const r = isRecord(payload) ? payload : {};
  const inner = isRecord(r.data) ? r.data : null;
  return inner ?? r;
}

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

  const data = unwrapPayloadRecord(payload);
  const tx = pickString(data, 'transactionId', 'txid');
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
 * Create table (Supabase SQL):
 *
 * ```sql
 * create table if not exists corpx_webhook_dedup (
 *   id text primary key,
 *   created_at timestamptz not null default now()
 * );
 * ```
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
