import { NextResponse } from 'next/server';

import { resolveApiKeyCommercialTerms } from '@/lib/api-keys/commercial';
import { readOptionalIntegratorExternalId } from '@/lib/api-keys/external-id';
import { createOfframpQuote, getOfframpQuoteSpreadBps } from '@/lib/offramp/quote';

import {
  apiKeyActor,
  badRequest,
  executeV1Route,
  handleV1OfframpRouteError,
} from '../../../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = 'POST /api/v1/offramp/orders/quote';

type QuoteRequestBody = {
  externalId?: unknown;
  amountUsdc?: unknown;
  payoutPixKey?: unknown;
  payoutBeneficiaryName?: unknown;
};

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function POST(request: Request) {
  return executeV1Route({
    request,
    route: ROUTE,
    requiredScope: 'offramp',
    idempotent: true,
    errorHandler: handleV1OfframpRouteError,
    handler: async (ctx) => {
      let body: QuoteRequestBody;
      try {
        body = (await request.json()) as QuoteRequestBody;
      } catch (error) {
        return handleV1OfframpRouteError(error);
      }

      if (typeof body.amountUsdc !== 'string') {
        return badRequest('amountUsdc must be provided as a string');
      }

      if (body.payoutBeneficiaryName != null && typeof body.payoutBeneficiaryName !== 'string') {
        return badRequest('payoutBeneficiaryName must be null or a string when provided');
      }

      let externalId: string | undefined;
      try {
        externalId = readOptionalIntegratorExternalId(body.externalId);
      } catch (error) {
        return badRequest(error instanceof Error ? error.message : String(error));
      }

      const payoutPixKey = readOptionalString(body.payoutPixKey);
      const payoutBeneficiaryName = readOptionalString(body.payoutBeneficiaryName);
      const actor = apiKeyActor(ctx);
      const commercial = await resolveApiKeyCommercialTerms(ctx, getOfframpQuoteSpreadBps(), 'offramp');

      const quote = await createOfframpQuote({
        amountUsdc: body.amountUsdc,
        payoutPixKey,
        payoutBeneficiaryName: payoutBeneficiaryName ?? null,
        integratorExternalId: externalId ?? null,
        quoteSpreadBps: commercial.spreadBps,
        apiKeyMaxAmountBrl: commercial.maxAmountBrl,
        actorEmail: actor.email ?? undefined,
        actorUserId: actor.userId,
      });

      return NextResponse.json(quote, { status: 200 });
    },
  });
}
