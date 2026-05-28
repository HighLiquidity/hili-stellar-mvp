import { NextResponse } from 'next/server';

import { createOfframpQuote } from '@/lib/offramp';
import { badRequest, handleOfframpRouteError, requireOfframpRouteOperator } from '../../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type QuoteRequestBody = {
  amountUsdc?: unknown;
  payoutPixKey?: unknown;
  payoutBeneficiaryName?: unknown;
};

/**
 * Internal quote endpoint for the new off-ramp flow.
 * Creates a `quoted` order and locks commercial parameters for a short TTL.
 */
export async function POST(request: Request) {
  const auth = await requireOfframpRouteOperator(request);
  if (!auth.ok) return auth.response;

  let body: QuoteRequestBody;
  try {
    body = (await request.json()) as QuoteRequestBody;
  } catch (error) {
    return handleOfframpRouteError(error);
  }

  if (typeof body.amountUsdc !== 'string' || typeof body.payoutPixKey !== 'string') {
    return badRequest('amountUsdc and payoutPixKey must be provided as strings');
  }

  if (body.payoutBeneficiaryName != null && typeof body.payoutBeneficiaryName !== 'string') {
    return badRequest('payoutBeneficiaryName must be null or a string when provided');
  }

  try {
    const quote = await createOfframpQuote({
      amountUsdc: body.amountUsdc,
      payoutPixKey: body.payoutPixKey,
      payoutBeneficiaryName:
        typeof body.payoutBeneficiaryName === 'string' ? body.payoutBeneficiaryName : null,
      actorEmail: auth.ctx.email,
      actorUserId: auth.ctx.userId,
    });

    return NextResponse.json(quote, { status: 200 });
  } catch (error) {
    return handleOfframpRouteError(error);
  }
}
