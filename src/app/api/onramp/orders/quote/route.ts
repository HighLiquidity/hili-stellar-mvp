import { NextResponse } from 'next/server';

import { resolvePanelQuoteCommercialTerms } from '@/lib/commercial/panel';
import { logOnrampEvent } from '@/lib/fiat-operations/log-onramp';
import { createOnrampQuote, getOnrampQuoteSpreadBps } from '@/lib/onramp';

import { badRequest, handleOnrampRouteError, requireOnrampRouteOperator } from '../../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type QuoteRequestBody = {
  taxId?: unknown;
  amountBrl?: unknown;
  amountUsdc?: unknown;
  destinationAddress?: unknown;
};

function readOptionalAmountString(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Internal quote endpoint for the new on-ramp flow.
 * Creates a `quoted` order and locks the commercial parameters for a short TTL.
 * Whitelist validation happens at lock time, not quote time.
 */
export async function POST(request: Request) {
  const auth = await requireOnrampRouteOperator(request);
  if (!auth.ok) return auth.response;

  let body: QuoteRequestBody;
  try {
    body = (await request.json()) as QuoteRequestBody;
  } catch (error) {
    return handleOnrampRouteError(error);
  }

  if (typeof body.taxId !== 'string') {
    await logOnrampEvent({
      phase: 'quote',
      status: 'error',
      actor: { email: auth.ctx.email, userId: auth.ctx.userId },
      errorCode: 'ONRAMP_BAD_REQUEST',
      errorMessage: 'taxId must be provided as a string',
      metadata: { source: 'api/onramp/orders/quote' },
    });
    return badRequest('taxId must be provided as a string');
  }

  const amountBrl = readOptionalAmountString(body.amountBrl);
  const amountUsdc = readOptionalAmountString(body.amountUsdc);
  const destinationAddress = readOptionalString(body.destinationAddress);

  if (amountBrl && amountUsdc) {
    await logOnrampEvent({
      phase: 'quote',
      status: 'error',
      actor: { email: auth.ctx.email, userId: auth.ctx.userId },
      errorCode: 'ONRAMP_BAD_REQUEST',
      errorMessage: 'Provide either amountBrl or amountUsdc, not both',
      metadata: { source: 'api/onramp/orders/quote' },
    });
    return badRequest('Provide either amountBrl or amountUsdc, not both');
  }

  if (!amountBrl && !amountUsdc) {
    await logOnrampEvent({
      phase: 'quote',
      status: 'error',
      actor: { email: auth.ctx.email, userId: auth.ctx.userId },
      errorCode: 'ONRAMP_BAD_REQUEST',
      errorMessage: 'amountBrl or amountUsdc must be provided as a non-empty string',
      metadata: { source: 'api/onramp/orders/quote' },
    });
    return badRequest('amountBrl or amountUsdc must be provided as a non-empty string');
  }

  try {
    const commercial = await resolvePanelQuoteCommercialTerms(auth.ctx, getOnrampQuoteSpreadBps(), 'onramp');
    const quote = await createOnrampQuote({
      taxId: body.taxId,
      amountBrl: amountBrl ?? undefined,
      amountUsdc: amountUsdc ?? undefined,
      destinationAddress,
      quoteSpreadBps: commercial.spreadBps,
      apiKeyMaxAmountBrl: commercial.maxAmountBrl,
      actorEmail: auth.ctx.email,
      actorUserId: auth.ctx.userId,
    });

    await logOnrampEvent({
      phase: 'quote',
      status: 'success',
      actor: { email: auth.ctx.email, userId: auth.ctx.userId },
      taxId: body.taxId,
      amountBrl: quote.quote.amountBrl,
      correlationId: quote.orderId,
      metadata: {
        source: 'api/onramp/orders/quote',
        destination_address: quote.destination.address,
        amount_usdc: quote.quote.amountUsdc,
      },
    });

    return NextResponse.json(quote, { status: 200 });
  } catch (error) {
    await logOnrampEvent({
      phase: 'quote',
      status: 'error',
      actor: { email: auth.ctx.email, userId: auth.ctx.userId },
      taxId: typeof body.taxId === 'string' ? body.taxId : null,
      amountBrl,
      errorCode:
        error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : null,
      errorMessage: error instanceof Error ? error.message : String(error),
      metadata: {
        source: 'api/onramp/orders/quote',
        amount_usdc: amountUsdc,
      },
    });
    return handleOnrampRouteError(error);
  }
}
