import { NextResponse } from 'next/server';

import {
  CorpXWebhookProcessor,
  buildCorpXWebhookDedupeKey,
  claimCorpXWebhookDedupe,
  getRequestClientIp,
  parseCorpXWebhookEnvelope,
} from '@/lib/corpx/webhooks';
import { settleInboundPixFromWebhook } from '@/lib/deposit/settle-inbound-pix';

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

  if (result.status === 'completed' && result.requiresAction === 'update_balance') {
    try {
      await settleInboundPixFromWebhook({ dedupeKey, eventType, payload, result });
    } catch (e) {
      console.error('[corpx webhook] inbound PIX settlement failed', e);
    }
  } else if (result.status === 'failed') {
    console.warn('[corpx webhook] event not settled', {
      eventType,
      error: result.errorMessage,
    });
  }

  return NextResponse.json(
    {
      ok: true,
      eventType,
      settled: result.requiresAction === 'update_balance' && result.status === 'completed',
      result,
    },
    { status: 200 },
  );
}