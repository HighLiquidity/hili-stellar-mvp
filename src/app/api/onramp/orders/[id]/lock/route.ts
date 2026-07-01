import { NextResponse } from 'next/server';

import { panelRampActor } from '@/lib/clients/scope';
import { logOnrampEvent } from '@/lib/fiat-operations/log-onramp';
import { lockOnrampOrderWithPix } from '@/lib/onramp';

import { handleOnrampRouteError, requireOnrampRouteOperator } from '../../../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Internal lock endpoint for the new on-ramp flow.
 * Converts a `quoted` order into `awaiting_pix` and creates the real CorpX charge.
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireOnrampRouteOperator(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  let body: { destinationAddress?: unknown } = {};
  try {
    const rawBody = await request.text();
    if (rawBody.trim()) {
      body = JSON.parse(rawBody) as { destinationAddress?: unknown };
    }
  } catch {
    return handleOnrampRouteError(new SyntaxError('Invalid JSON'));
  }

  const destinationAddress =
    typeof body.destinationAddress === 'string' && body.destinationAddress.trim()
      ? body.destinationAddress.trim()
      : undefined;

  try {
    const locked = await lockOnrampOrderWithPix({
      orderId: id,
      actor: panelRampActor(auth.ctx),
      destinationAddress,
    });

    await logOnrampEvent({
      phase: 'lock',
      status: 'success',
      actor: { email: auth.ctx.email, userId: auth.ctx.userId },
      taxId: null,
      amountBrl: locked.quote.amountBrl,
      providerTxId: locked.pix.txid,
      correlationId: locked.orderId,
      metadata: { source: 'api/onramp/orders/[id]/lock' },
    });

    return NextResponse.json(locked, { status: 200 });
  } catch (error) {
    await logOnrampEvent({
      phase: 'lock',
      status: 'error',
      actor: { email: auth.ctx.email, userId: auth.ctx.userId },
      correlationId: id,
      errorCode:
        error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : null,
      errorMessage: error instanceof Error ? error.message : String(error),
      metadata: { source: 'api/onramp/orders/[id]/lock' },
    });
    return handleOnrampRouteError(error);
  }
}
