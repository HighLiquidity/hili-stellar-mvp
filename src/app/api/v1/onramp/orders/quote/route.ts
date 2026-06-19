import { NextResponse } from 'next/server';

import { resolveApiKeyCommercialTerms } from '@/lib/api-keys/commercial';
import { readOptionalIntegratorExternalId } from '@/lib/api-keys/external-id';
import { getOnrampQuoteSpreadBps } from '@/lib/onramp/quote';
import { createOnrampQuote } from '@/lib/onramp';

import {
  apiKeyActor,
  badRequest,
  executeV1Route,
  handleV1OnrampRouteError,
} from '../../../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROUTE = 'POST /api/v1/onramp/orders/quote';

type QuoteRequestBody = {
  externalId?: unknown;
  taxId?: unknown;
  amountBrl?: unknown;
  amountUsdc?: unknown;
  destinationAddress?: unknown;
};

function readOptionalAmountString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function POST(request: Request) {
  return executeV1Route({
    request,
    route: ROUTE,
    requiredScope: 'onramp',
    idempotent: true,
    errorHandler: handleV1OnrampRouteError,
    handler: async (ctx) => {
      let body: QuoteRequestBody;
      try {
        body = (await request.json()) as QuoteRequestBody;
      } catch (error) {
        return handleV1OnrampRouteError(error);
      }

      if (typeof body.taxId !== 'string') {
        return badRequest('taxId must be provided as a string');
      }

      let externalId: string | undefined;
      try {
        externalId = readOptionalIntegratorExternalId(body.externalId);
      } catch (error) {
        return badRequest(error instanceof Error ? error.message : String(error));
      }

      const amountBrl = readOptionalAmountString(body.amountBrl);
      const amountUsdc = readOptionalAmountString(body.amountUsdc);
      const destinationAddress = readOptionalString(body.destinationAddress);

      if (amountBrl && amountUsdc) {
        return badRequest('Provide either amountBrl or amountUsdc, not both');
      }

      if (!amountBrl && !amountUsdc) {
        return badRequest('amountBrl or amountUsdc must be provided as a non-empty string');
      }

      const actor = apiKeyActor(ctx);
      const commercial = await resolveApiKeyCommercialTerms(ctx, getOnrampQuoteSpreadBps(), 'onramp');
      const quote = await createOnrampQuote({
        taxId: body.taxId,
        amountBrl: amountBrl ?? undefined,
        amountUsdc: amountUsdc ?? undefined,
        destinationAddress,
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
