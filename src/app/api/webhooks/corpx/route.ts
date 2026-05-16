import { NextResponse } from 'next/server';

import {
  CorpXWebhookProcessor,
  buildCorpXWebhookDedupeKey,
  claimCorpXWebhookDedupe,
  getRequestClientIp,
  parseCorpXWebhookEnvelope,
} from '@/lib/corpx/webhooks';
import { onConfirmedPixInboundSettlement } from '@/lib/brh/on-pix-confirmed';

/**
 * CorpX → your app (IP allowlist + optional Supabase dedup).
 * Configure URL in CorpX portal; on Vercel use the deployed origin + this path.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const processor = CorpXWebhookProcessor.fromEnv();
  const clientIp = getRequestClientIp(request);

  if (!processor.validateWebhookSignature(raw, clientIp)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let json: unknown;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const headerEvent = request.headers.get('x-webhook-event');

  let eventType: string;
  let payload: unknown;
  try {
    const parsed = parseCorpXWebhookEnvelope(json, headerEvent);
    eventType = parsed.eventType;
    payload = parsed.payload;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Bad Request';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const dedupeKey = buildCorpXWebhookDedupeKey(request.headers, eventType, payload, raw);
  const claimed = await claimCorpXWebhookDedupe(dedupeKey);
  if (!claimed) {
    return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
  }

  const result = processor.processWebhookEvent(eventType, payload);

  try {
    await onConfirmedPixInboundSettlement({ dedupeKey, eventType, payload, result });
  } catch (e) {
    console.error('[corpx webhook] BRH settlement hook failed', e);
  }

  return NextResponse.json({ ok: true, result }, { status: 200 });
}