import { NextResponse } from 'next/server';

import { readOfframpOrder } from '@/lib/offramp';
import { handleOfframpRouteError, requireOfframpRouteOperator } from '../../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Internal order-read endpoint for the off-ramp flow.
 * Returns aggregate order state expected by UI polling.
 */
export async function GET(request: Request, context: RouteContext) {
  const auth = await requireOfframpRouteOperator(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  try {
    const order = await readOfframpOrder(id);
    return NextResponse.json(order, { status: 200 });
  } catch (error) {
    return handleOfframpRouteError(error);
  }
}
