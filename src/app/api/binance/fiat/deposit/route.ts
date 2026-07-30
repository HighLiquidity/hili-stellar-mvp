import { NextResponse } from 'next/server';

import { binance } from '@/lib/server/binance';

import { badRequest, handleBinanceRouteError, requireBinanceRouteAdmin } from '../../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PostBody = {
  amount?: unknown;
  confirm?: unknown;
  currency?: unknown;
  apiPaymentMethod?: unknown;
};

/**
 * Internal admin-only BRL/PIX fiat deposit create.
 * Requires `{ confirm: true }` to avoid accidental capital-side orders.
 */
export async function POST(request: Request) {
  const authError = await requireBinanceRouteAdmin(request);
  if (authError) return authError;

  try {
    let body: PostBody;
    try {
      body = (await request.json()) as PostBody;
    } catch {
      return badRequest('Invalid JSON body');
    }

    if (body.confirm !== true) {
      return badRequest(
        'confirm: true is required to create a Binance fiat deposit (this creates a real order).',
      );
    }

    if (typeof body.amount !== 'number' && typeof body.amount !== 'string') {
      return badRequest('amount (number or string) is required');
    }

    if (body.currency != null && body.currency !== 'BRL') {
      return badRequest('currency must be BRL when provided');
    }

    if (body.apiPaymentMethod != null && body.apiPaymentMethod !== 'Pix') {
      return badRequest('apiPaymentMethod must be Pix when provided');
    }

    const deposit = await binance.fiat.createDeposit({
      amount: body.amount,
      currency: 'BRL',
      apiPaymentMethod: 'Pix',
    });

    return NextResponse.json({ deposit }, { status: 201 });
  } catch (error) {
    return handleBinanceRouteError(error);
  }
}
