import { NextResponse } from 'next/server';

import { resolvePanelQuoteCommercialTerms } from '@/lib/commercial/panel';
import { createOfframpQuote, getOfframpQuoteSpreadBps } from '@/lib/offramp';
import { isClientTenantRampActor } from '@/lib/users/roles';
import { badRequest, handleOfframpRouteError, requireOfframpRouteOperator } from '../../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type QuoteRequestBody = {
  amountUsdc?: unknown;
  payoutPixKey?: unknown;
  payoutBeneficiaryName?: unknown;
};

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Internal quote endpoint for the new off-ramp flow.
 * Creates a `quoted` order and locks commercial parameters for a short TTL.
 * Whitelist validation happens at lock time, not quote time.
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

  if (typeof body.amountUsdc !== 'string') {
    return badRequest('amountUsdc must be provided as a string');
  }

  if (body.payoutBeneficiaryName != null && typeof body.payoutBeneficiaryName !== 'string') {
    return badRequest('payoutBeneficiaryName must be null or a string when provided');
  }

  const payoutPixKey = readOptionalString(body.payoutPixKey);
  const payoutBeneficiaryName = readOptionalString(body.payoutBeneficiaryName);

  try {
    const commercial = await resolvePanelQuoteCommercialTerms(auth.ctx, getOfframpQuoteSpreadBps(), 'offramp');
    const quote = await createOfframpQuote({
      amountUsdc: body.amountUsdc,
      payoutPixKey,
      payoutBeneficiaryName: payoutBeneficiaryName ?? null,
      quoteSpreadBps: commercial.spreadBps,
      apiKeyMaxAmountBrl: commercial.maxAmountBrl,
      actorEmail: auth.ctx.email,
      actorUserId: auth.ctx.userId,
      actorClientId: isClientTenantRampActor(auth.ctx.role) ? auth.ctx.clientId : null,
    });

    return NextResponse.json(quote, { status: 200 });
  } catch (error) {
    return handleOfframpRouteError(error);
  }
}
