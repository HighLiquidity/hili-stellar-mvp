import { NextResponse } from 'next/server';

import { logOnrampEvent } from '@/lib/fiat-operations/log-onramp';
import { createOnrampQuote } from '@/lib/onramp';

import { badRequest, handleOnrampRouteError, requireOnrampRouteOperator } from '../../_utils';
import { getOnrampWithdrawNetwork } from '@/lib/withdraw-whitelist/onramp-network';
import { findActiveWithdrawWhitelistEntry } from '@/lib/withdraw-whitelist/store';

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

/**
 * Internal quote endpoint for the new on-ramp flow.
 * Creates a `quoted` order and locks the commercial parameters for a short TTL.
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

  if (typeof body.taxId !== 'string' || typeof body.destinationAddress !== 'string') {
    await logOnrampEvent({
      phase: 'quote',
      status: 'error',
      actor: { email: auth.ctx.email, userId: auth.ctx.userId },
      errorCode: 'ONRAMP_BAD_REQUEST',
      errorMessage: 'taxId and destinationAddress must be provided as strings',
      metadata: { source: 'api/onramp/orders/quote' },
    });
    return badRequest('taxId and destinationAddress must be provided as strings');
  }

  const amountBrl = readOptionalAmountString(body.amountBrl);
  const amountUsdc = readOptionalAmountString(body.amountUsdc);

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

  const network = getOnrampWithdrawNetwork();

  const whitelistEntry = await findActiveWithdrawWhitelistEntry({
    address: body.destinationAddress,
    network,
  });

  if (!whitelistEntry) {
    await logOnrampEvent({
      phase: 'quote',
      status: 'error',
      actor: { email: auth.ctx.email, userId: auth.ctx.userId },
      taxId: body.taxId,
      amountBrl,
      errorCode: 'ONRAMP_WALLET_NOT_WHITELISTED',
      errorMessage: `Destination address is not whitelisted for on-ramp network ${network}.`,
      metadata: {
        source: 'api/onramp/orders/quote',
        destination_address: body.destinationAddress,
        network,
        amount_usdc: amountUsdc,
      },
    });

    return badRequest(`Destination address is not whitelisted for on-ramp network ${network}.`);
  }

  try {
    const quote = await createOnrampQuote({
      taxId: body.taxId,
      amountBrl: amountBrl ?? undefined,
      amountUsdc: amountUsdc ?? undefined,
      destinationAddress: body.destinationAddress,
      destinationMemo: whitelistEntry.memo,
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
        destination_address: body.destinationAddress,
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
