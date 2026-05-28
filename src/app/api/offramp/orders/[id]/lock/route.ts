import { NextResponse } from 'next/server';

import { lockOfframpQuote } from '@/lib/offramp';
import { handleOfframpRouteError, requireOfframpRouteOperator } from '../../../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Internal lock endpoint for the off-ramp flow.
 * Converts a `quoted` order into `awaiting_deposit` and returns deposit instructions.
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireOfframpRouteOperator(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  try {
    const locked = await lockOfframpQuote({ orderId: id });
    return NextResponse.json(locked, { status: 200 });
  } catch (error) {
    return handleOfframpRouteError(error);
  }
}
