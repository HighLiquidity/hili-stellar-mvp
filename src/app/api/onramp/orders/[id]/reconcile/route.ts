import { NextResponse } from 'next/server';

import { assertOnrampOrderInDataScope, resolvePanelDataScope } from '@/lib/clients/scope';
import { logOnrampEvent } from '@/lib/fiat-operations/log-onramp';
import { getOnrampOrder, startOnrampReconciliation } from '@/lib/onramp';
import { findOnrampOrderById } from '@/lib/onramp/order-store';

import { handleOnrampRouteError, requireOnrampRouteOperator } from '../../../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Internal manual retry endpoint for post-delivery reconciliation.
 * Intended for operator/admin use when an order is stuck after `usdc_delivered`.
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireOnrampRouteOperator(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  try {
    const scope = resolvePanelDataScope(auth.ctx);
    const existing = await findOnrampOrderById(id);
    assertOnrampOrderInDataScope(existing, scope, { userId: auth.ctx.userId });

    await startOnrampReconciliation(id, { source: 'api/onramp/orders/reconcile' });
    const order = await getOnrampOrder(id);

    await logOnrampEvent({
      phase: 'reconcile',
      status: 'success',
      actor: { email: auth.ctx.email, userId: auth.ctx.userId },
      amountBrl: order.quote.amountBrl,
      correlationId: order.orderId,
      metadata: { source: 'api/onramp/orders/[id]/reconcile', status: order.status },
    });

    return NextResponse.json(
      {
        ok: true,
        order,
      },
      { status: 200 },
    );
  } catch (error) {
    await logOnrampEvent({
      phase: 'reconcile',
      status: 'error',
      actor: { email: auth.ctx.email, userId: auth.ctx.userId },
      correlationId: id,
      errorCode:
        error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : null,
      errorMessage: error instanceof Error ? error.message : String(error),
      metadata: { source: 'api/onramp/orders/[id]/reconcile' },
    });
    return handleOnrampRouteError(error);
  }
}
