import { NextResponse } from 'next/server';

import { getRampCallbackSecret } from '@/lib/ramp/config';
import { applyRampCallbackUpdate } from '@/lib/ramp/operation-store';
import type { RampCallbackPayload } from '@/lib/ramp/types';
import { verifyRampCallbackSignature } from '@/lib/ramp/webhook-verify';

/**
 * On/Off-Ramp API status callbacks (HMAC X-Signature on raw body).
 * Configure callbackUrl on each operation to this path (HTTPS).
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const secret = getRampCallbackSecret();

  if (!secret) {
    console.error('[ramp webhook] RAMP_CALLBACK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  const signature = request.headers.get('x-signature');
  if (!verifyRampCallbackSignature(raw, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: RampCallbackPayload;
  try {
    payload = JSON.parse(raw) as RampCallbackPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { operationId, status, version, type, data } = payload;
  if (!operationId || typeof version !== 'number' || !status) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  if (type !== 'onramp' && type !== 'offramp') {
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
  }

  const txHash = typeof data?.txHash === 'string' ? data.txHash : null;
  const reason = typeof data?.reason === 'string' ? data.reason : null;
  const destination = typeof data?.destination === 'string' ? data.destination : null;
  const amount = typeof data?.amount === 'string' ? data.amount : null;

  const result = await applyRampCallbackUpdate({
    rampOperationId: operationId,
    status,
    version,
    txHash,
    destination,
    amount,
    failureReason: reason,
    callbackData: data ?? undefined,
  });

  if (!result.applied && result.reason !== 'stale callback version') {
    console.warn('[ramp webhook] callback not applied', {
      operationId,
      version,
      reason: result.reason,
    });
  }

  return NextResponse.json({ ok: true, applied: result.applied }, { status: 200 });
}
