import { NextResponse } from 'next/server';

import { logOnrampEvent } from '@/lib/fiat-operations/log-onramp';
import { getOnrampOrder } from '@/lib/onramp';

import { handleOnrampRouteError, requireOnrampRouteOperator } from '../../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Internal order-read endpoint for the new on-ramp flow.
 * Returns the aggregate order state expected by the UI polling loop.
 */
export async function GET(request: Request, context: RouteContext) {
  const auth = await requireOnrampRouteOperator(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  try {
    const order = await getOnrampOrder(id);
    return NextResponse.json(order, { status: 200 });
  } catch (error) {
    await logOnrampEvent({
      phase: 'read_order',
      status: 'error',
      actor: { email: auth.ctx.email, userId: auth.ctx.userId },
      correlationId: id,
      errorCode:
        error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : null,
      errorMessage: error instanceof Error ? error.message : String(error),
      metadata: { source: 'api/onramp/orders/[id]' },
    });
    return handleOnrampRouteError(error);
  }
}
