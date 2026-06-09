import { NextResponse } from 'next/server';

import { assertOnrampOrderOwnedByUser } from '@/lib/api-keys/ownership';
import { lockOnrampOrderWithPix } from '@/lib/onramp';
import { findOnrampOrderById } from '@/lib/onramp/order-store';

import {
  apiKeyActor,
  executeV1Route,
  handleV1OnrampRouteError,
} from '../../../../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = 'POST /api/v1/onramp/orders/:id/lock';

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;

  return executeV1Route({
    request,
    route: ROUTE,
    requiredScope: 'onramp',
    idempotent: true,
    errorHandler: handleV1OnrampRouteError,
    handler: async (ctx) => {
      let body: { destinationAddress?: unknown } = {};
      try {
        const rawBody = await request.text();
        if (rawBody.trim()) {
          body = JSON.parse(rawBody) as { destinationAddress?: unknown };
        }
      } catch {
        return handleV1OnrampRouteError(new SyntaxError('Invalid JSON'));
      }

      const destinationAddress =
        typeof body.destinationAddress === 'string' && body.destinationAddress.trim()
          ? body.destinationAddress.trim()
          : undefined;

      const existing = await findOnrampOrderById(id);
      assertOnrampOrderOwnedByUser(existing, ctx.userId);

      const locked = await lockOnrampOrderWithPix({
        orderId: id,
        actor: apiKeyActor(ctx),
        destinationAddress,
      });

      return NextResponse.json(locked, { status: 200 });
    },
  });
}
