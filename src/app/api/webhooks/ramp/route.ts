import { NextResponse } from 'next/server';

import { getRampCallbackSecret } from '@/lib/ramp/config';
import { applyBrhSaleRampCallback, applyUsdcDeliveryRampCallback } from '@/lib/onramp';
import {
  applyOfframpBrhIssueRampCallback,
  applyOfframpBrhRedemptionRampCallback,
  applyOfframpUsdcDepositRampCallback,
} from '@/lib/offramp';
import { isOfframpUsdcDepositExternalId } from '@/lib/offramp/references';
import { applyRampCallbackUpdate, findRampOperationByRampOperationId } from '@/lib/ramp/operation-store';
import type { RampCallbackPayload } from '@/lib/ramp/types';
import { verifyRampCallbackSignature } from '@/lib/ramp/webhook-verify';

const TERMINAL_OFFRAMP_CALLBACK_STATUSES = new Set([
  'confirmed',
  'completed',
  'failed',
  'expired',
  'needs_review',
  'insufficient_funds',
  'callback_failed',
]);

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

  const txHash =
    (typeof data?.txHash === 'string' && data.txHash) ||
    (typeof data?.depositTxHash === 'string' && data.depositTxHash) ||
    null;
  const failureReason =
    (typeof data?.failureReason === 'string' && data.failureReason) ||
    (typeof data?.reason === 'string' && data.reason) ||
    null;
  const destination = typeof data?.destination === 'string' ? data.destination : null;
  const amount =
    (typeof data?.amount === 'string' && data.amount) ||
    (typeof data?.receivedAmount === 'string' && data.receivedAmount) ||
    null;
  const callbackExternalId = typeof data?.externalId === 'string' ? data.externalId.trim() : '';

  const result = await applyRampCallbackUpdate({
    rampOperationId: operationId,
    status,
    version,
    txHash,
    destination,
    amount,
    failureReason,
    callbackData: data ?? undefined,
  });

  if (!result.applied && result.reason !== 'stale callback version') {
    console.warn('[ramp webhook] callback not applied', {
      operationId,
      version,
      reason: result.reason,
    });
  }

  const operation = await findRampOperationByRampOperationId(operationId);
  const externalId = callbackExternalId || operation?.external_id || '';

  const shouldSyncOrderHandlers =
    result.applied ||
    (type === 'offramp' &&
      TERMINAL_OFFRAMP_CALLBACK_STATUSES.has(status) &&
      Boolean(externalId));

  if (shouldSyncOrderHandlers && externalId) {
    try {
      await applyBrhSaleRampCallback({
        externalId,
        rampOperationId: operationId,
        status,
        failureReason,
      });
      await applyUsdcDeliveryRampCallback({
        externalId,
        rampOperationId: operationId,
        status,
        txHash,
        failureReason,
      });
      if (type === 'offramp' && isOfframpUsdcDepositExternalId(externalId)) {
        await applyOfframpUsdcDepositRampCallback({
          externalId,
          rampOperationId: operationId,
          status,
          txHash,
          amount,
          failureReason,
        });
      }
      await applyOfframpBrhIssueRampCallback({
        externalId,
        rampOperationId: operationId,
        status,
        failureReason,
      });
      await applyOfframpBrhRedemptionRampCallback({
        externalId,
        rampOperationId: operationId,
        status,
        failureReason,
      });
    } catch (error) {
      console.error('[ramp webhook] failed to sync order from callback', {
        operationId,
        externalId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({ ok: true, applied: result.applied }, { status: 200 });
}
