import { NextResponse } from 'next/server';

import { assertOnrampOrderOwnedByApiKey } from '@/lib/api-keys/ownership';
import { toPublicOnrampOrderResponse } from '@/lib/api-keys/v1-responses';
import { getOnrampOrder } from '@/lib/onramp';
import { findOnrampOrderById } from '@/lib/onramp/order-store';

import { executeV1Route, handleV1OnrampRouteError } from '../../../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = 'GET /api/v1/onramp/orders/:id';

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
    errorHandler: handleV1OnrampRouteError,
    handler: async (ctx) => {
      const existing = await findOnrampOrderById(id);
      assertOnrampOrderOwnedByApiKey(existing, ctx);

      const order = await getOnrampOrder(id);
      return NextResponse.json(
        toPublicOnrampOrderResponse(order, existing.integrator_external_id),
        { status: 200 },
      );
    },
  });
}
