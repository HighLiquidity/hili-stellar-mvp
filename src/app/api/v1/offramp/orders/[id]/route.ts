import { NextResponse } from 'next/server';

import { assertOfframpOrderOwnedByUser } from '@/lib/api-keys/ownership';
import { toPublicOfframpOrderResponse } from '@/lib/api-keys/v1-responses';
import { readOfframpOrder } from '@/lib/offramp';
import { findOfframpOrderById } from '@/lib/offramp/order-store';

import { executeV1Route, handleV1OfframpRouteError } from '../../../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = 'GET /api/v1/offramp/orders/:id';

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;

  return executeV1Route({
    request,
    route: ROUTE,
    requiredScope: 'orders:read',
    errorHandler: handleV1OfframpRouteError,
    handler: async (ctx) => {
      const existing = await findOfframpOrderById(id);
      assertOfframpOrderOwnedByUser(existing, ctx.userId);

      const order = await readOfframpOrder(id);
      return NextResponse.json(
        toPublicOfframpOrderResponse(order, existing.integrator_external_id),
        { status: 200 },
      );
    },
  });
}
