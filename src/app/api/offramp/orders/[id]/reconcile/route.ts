import { NextResponse } from 'next/server';

import { readOfframpOrder, retryOfframpReconciliation } from '@/lib/offramp';
import { handleOfframpRouteError, requireOfframpRouteOperator } from '../../../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Internal manual retry endpoint for off-ramp reconciliation.
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireOfframpRouteOperator(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  try {
    await retryOfframpReconciliation(id);
    const order = await readOfframpOrder(id);

    return NextResponse.json(
      {
        ok: true,
        order,
      },
      { status: 200 },
    );
  } catch (error) {
    return handleOfframpRouteError(error);
  }
}
