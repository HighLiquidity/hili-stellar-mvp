import { NextResponse } from 'next/server';

import { panelRampActor } from '@/lib/clients/scope';
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

  let body: { payoutPixKey?: unknown; payoutBeneficiaryName?: unknown } = {};
  try {
    const rawBody = await request.text();
    if (rawBody.trim()) {
      body = JSON.parse(rawBody) as { payoutPixKey?: unknown; payoutBeneficiaryName?: unknown };
    }
  } catch {
    return handleOfframpRouteError(new SyntaxError('Invalid JSON'));
  }

  const payoutPixKey =
    typeof body.payoutPixKey === 'string' && body.payoutPixKey.trim() ? body.payoutPixKey.trim() : undefined;
  const payoutBeneficiaryName =
    typeof body.payoutBeneficiaryName === 'string' ? body.payoutBeneficiaryName : undefined;

  try {
    const locked = await lockOfframpQuote({
      orderId: id,
      actor: panelRampActor(auth.ctx),
      payoutPixKey,
      payoutBeneficiaryName,
    });
    return NextResponse.json(locked, { status: 200 });
  } catch (error) {
    return handleOfframpRouteError(error);
  }
}
