import { NextResponse } from 'next/server';

import { assertOfframpOrderOwnedByUser } from '@/lib/api-keys/ownership';
import { lockOfframpQuote } from '@/lib/offramp';
import { findOfframpOrderById } from '@/lib/offramp/order-store';

import {
  apiKeyActor,
  executeV1Route,
  handleV1OfframpRouteError,
} from '../../../../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = 'POST /api/v1/offramp/orders/:id/lock';

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
    requiredScope: 'offramp',
    idempotent: true,
    errorHandler: handleV1OfframpRouteError,
    handler: async (ctx) => {
      let body: { payoutPixKey?: unknown; payoutBeneficiaryName?: unknown } = {};
      try {
        const rawBody = await request.text();
        if (rawBody.trim()) {
          body = JSON.parse(rawBody) as { payoutPixKey?: unknown; payoutBeneficiaryName?: unknown };
        }
      } catch {
        return handleV1OfframpRouteError(new SyntaxError('Invalid JSON'));
      }

      const payoutPixKey =
        typeof body.payoutPixKey === 'string' && body.payoutPixKey.trim() ? body.payoutPixKey.trim() : undefined;
      const payoutBeneficiaryName =
        typeof body.payoutBeneficiaryName === 'string' && body.payoutBeneficiaryName.trim()
          ? body.payoutBeneficiaryName.trim()
          : undefined;

      const existing = await findOfframpOrderById(id);
      assertOfframpOrderOwnedByUser(existing, ctx.userId);

      const locked = await lockOfframpQuote({
        orderId: id,
        actor: apiKeyActor(ctx),
        payoutPixKey,
        payoutBeneficiaryName,
      });

      return NextResponse.json(locked, { status: 200 });
    },
  });
}
