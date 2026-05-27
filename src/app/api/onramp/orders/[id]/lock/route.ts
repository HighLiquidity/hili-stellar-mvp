import { NextResponse } from 'next/server';

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

  try {
    const locked = await lockOnrampOrderWithPix(id);

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
