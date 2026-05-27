import { NextResponse } from 'next/server';

import { logOnrampEvent } from '@/lib/fiat-operations/log-onramp';
import { createOnrampQuote } from '@/lib/onramp';

import { badRequest, handleOnrampRouteError, requireOnrampRouteOperator } from '../../_utils';
import { isWithdrawAddressWhitelistedForUser } from '@/lib/withdraw-whitelist/store';
import type { WithdrawWhitelistNetwork } from '@/lib/withdraw-whitelist/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type QuoteRequestBody = {
  taxId?: unknown;
  amountBrl?: unknown;
  destinationAddress?: unknown;
  destinationMemo?: unknown;
};

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

  if (
    typeof body.taxId !== 'string' ||
    typeof body.amountBrl !== 'string' ||
    typeof body.destinationAddress !== 'string'
  ) {
    await logOnrampEvent({
      phase: 'quote',
      status: 'error',
      actor: { email: auth.ctx.email, userId: auth.ctx.userId },
      errorCode: 'ONRAMP_BAD_REQUEST',
      errorMessage: 'taxId, amountBrl and destinationAddress must be provided as strings',
      metadata: { source: 'api/onramp/orders/quote' },
    });
    return badRequest('taxId, amountBrl and destinationAddress must be provided as strings');
  }

  if (body.destinationMemo != null && typeof body.destinationMemo !== 'string') {
    await logOnrampEvent({
      phase: 'quote',
      status: 'error',
      actor: { email: auth.ctx.email, userId: auth.ctx.userId },
      errorCode: 'ONRAMP_BAD_REQUEST',
      errorMessage: 'destinationMemo must be null or a string when provided',
      metadata: { source: 'api/onramp/orders/quote' },
    });
    return badRequest('destinationMemo must be null or a string when provided');
  }

  const network: WithdrawWhitelistNetwork =
    process.env.ONRAMP_WITHDRAW_NETWORK === 'STELLAR_PUBLIC' ? 'STELLAR_PUBLIC' : 'STELLAR_TESTNET';

  const isWhitelisted = await isWithdrawAddressWhitelistedForUser({
    userId: auth.ctx.userId,
    address: body.destinationAddress,
    network,
  });

  if (!isWhitelisted) {
    await logOnrampEvent({
      phase: 'quote',
      status: 'error',
      actor: { email: auth.ctx.email, userId: auth.ctx.userId },
      taxId: body.taxId,
      amountBrl: body.amountBrl,
      errorCode: 'ONRAMP_WALLET_NOT_WHITELISTED',
      errorMessage: 'Destination address is not whitelisted for this user.',
      metadata: {
        source: 'api/onramp/orders/quote',
        destination_address: body.destinationAddress,
        network,
      },
    });

    return badRequest('Destination address is not whitelisted for this user.');
  }

  try {
    const quote = await createOnrampQuote({
      taxId: body.taxId,
      amountBrl: body.amountBrl,
      destinationAddress: body.destinationAddress,
      destinationMemo: typeof body.destinationMemo === 'string' ? body.destinationMemo : null,
      actorEmail: auth.ctx.email,
      actorUserId: auth.ctx.userId,
    });

    await logOnrampEvent({
      phase: 'quote',
      status: 'success',
      actor: { email: auth.ctx.email, userId: auth.ctx.userId },
      taxId: body.taxId,
      amountBrl: body.amountBrl,
      correlationId: quote.orderId,
      metadata: {
        source: 'api/onramp/orders/quote',
        destination_address: body.destinationAddress,
      },
    });

    return NextResponse.json(quote, { status: 200 });
  } catch (error) {
    await logOnrampEvent({
      phase: 'quote',
      status: 'error',
      actor: { email: auth.ctx.email, userId: auth.ctx.userId },
      taxId: typeof body.taxId === 'string' ? body.taxId : null,
      amountBrl: typeof body.amountBrl === 'string' ? body.amountBrl : null,
      errorCode:
        error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : null,
      errorMessage: error instanceof Error ? error.message : String(error),
      metadata: { source: 'api/onramp/orders/quote' },
    });
    return handleOnrampRouteError(error);
  }
}
