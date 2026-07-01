import { NextResponse } from 'next/server';

import { assertOfframpOrderInDataScope, resolvePanelDataScope } from '@/lib/clients/scope';
import { readOfframpOrder, retryOfframpReconciliation } from '@/lib/offramp';
import { resetOfframpBrhRedemptionForRetry } from '@/lib/offramp/brh-redemption-retry';
import { findOfframpOrderById } from '@/lib/offramp/order-store';
import { attachOfframpPixPayoutEndToEndId } from '@/lib/offramp/pix-payout-sync';
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
    const scope = resolvePanelDataScope(auth.ctx);
    const existing = await findOfframpOrderById(id);
    assertOfframpOrderInDataScope(existing, scope, { userId: auth.ctx.userId });

    let endToEndId: string | undefined;
    let resetBrhRedemption = false;
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const body = (await request.json().catch(() => null)) as {
        endToEndId?: unknown;
        resetBrhRedemption?: unknown;
      } | null;
      if (typeof body?.endToEndId === 'string' && body.endToEndId.trim()) {
        endToEndId = body.endToEndId.trim();
      }
      resetBrhRedemption = body?.resetBrhRedemption === true;
    }

    if (endToEndId) {
      await attachOfframpPixPayoutEndToEndId({ orderId: id, endToEndId });
    }

    let brhRedemptionRetry:
      | {
          previousRedemptionExternalId: string;
          nextRedemptionExternalId: string;
        }
      | undefined;

    if (resetBrhRedemption) {
      const retry = await resetOfframpBrhRedemptionForRetry(id);
      brhRedemptionRetry = {
        previousRedemptionExternalId: retry.previousRedemptionExternalId,
        nextRedemptionExternalId: retry.nextRedemptionExternalId,
      };
    } else {
      await retryOfframpReconciliation(id);
    }

    const order = await readOfframpOrder(id);

    return NextResponse.json(
      {
        ok: true,
        order,
        brhRedemptionRetry,
      },
      { status: 200 },
    );
  } catch (error) {
    return handleOfframpRouteError(error);
  }
}
