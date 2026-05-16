import { NextResponse } from 'next/server';

import {
  CorpXWebhookProcessor,
  buildCorpXWebhookDedupeKey,
  claimCorpXWebhookDedupe,
  getRequestClientIp,
  parseCorpXWebhookEnvelope,
  recordCorpXWebhookDelivery,
} from '@/lib/corpx/webhooks';
import { settleInboundPixFromWebhook } from '@/lib/deposit/settle-inbound-pix';

/**
 * CorpX → your app (IP allowlist + Supabase dedup + audit log).
 * Configure URL in CorpX portal; subscribe to `qrcode.paid` for dynamic PIX deposits.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const processor = CorpXWebhookProcessor.fromEnv();
  const clientIp = getRequestClientIp(request);

  if (!processor.validateWebhookSignature(raw, clientIp)) {
    console.warn('[corpx webhook] forbidden', { clientIp });
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
    await recordCorpXWebhookDelivery({
      dedupeKey,
      eventType,
      clientIp,
      duplicateDelivery: true,
      payload,
      result: {
        eventType,
        status: 'completed',
        errorMessage: 'duplicate delivery',
      },
      settled: false,
    });
    return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
  }

  const result = processor.processWebhookEvent(eventType, payload);
  const shouldSettle = result.status === 'completed' && result.requiresAction === 'update_balance';
  let settled = false;

  if (shouldSettle) {
    try {
      await settleInboundPixFromWebhook({ dedupeKey, eventType, payload, result });
      settled = true;
    } catch (e) {
      console.error('[corpx webhook] inbound PIX settlement failed', e);
    }
  } else if (result.status === 'failed') {
    console.warn('[corpx webhook] event not settled', {
      eventType,
      error: result.errorMessage,
    });
  }

  await recordCorpXWebhookDelivery({
    dedupeKey,
    eventType,
    clientIp,
    duplicateDelivery: false,
    payload,
    result,
    settled,
  });

  return NextResponse.json(
    {
      ok: true,
      eventType,
      settled,
      result,
    },
    { status: 200 },
  );
}
