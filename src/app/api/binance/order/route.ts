import { NextResponse } from 'next/server';

import { binance } from '@/lib/server/binance';
import type { BinanceOrderSide } from '@/lib/server/binance';

import { badRequest, handleBinanceRouteError, requireBinanceRouteAdmin } from '../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type BinanceOrderRequestBody = {
  symbol?: unknown;
  side?: unknown;
  quantity?: unknown;
  quoteOrderQty?: unknown;
};

/** Internal admin-only utility route for testing Binance spot market orders. */
export async function POST(request: Request) {
  const authError = await requireBinanceRouteAdmin(request);
  if (authError) return authError;

  let body: BinanceOrderRequestBody;
  try {
    body = (await request.json()) as BinanceOrderRequestBody;
  } catch (error) {
    return handleBinanceRouteError(error);
  }

  if (typeof body.symbol !== 'string' || typeof body.side !== 'string') {
    return badRequest('symbol and side must be provided as strings');
  }

  if (body.side !== 'BUY' && body.side !== 'SELL') {
    return badRequest('side must be BUY or SELL');
  }

  const hasQuantity = typeof body.quantity === 'string';
  const hasQuoteOrderQty = typeof body.quoteOrderQty === 'string';

  if (hasQuantity === hasQuoteOrderQty) {
    return badRequest('provide exactly one of quantity or quoteOrderQty as a string');
  }

  const symbol = body.symbol;
  const side = body.side as BinanceOrderSide;
  const quantity = hasQuantity ? (body.quantity as string) : null;
  const quoteOrderQty = hasQuoteOrderQty ? (body.quoteOrderQty as string) : null;

  try {
    const order = quoteOrderQty
      ? await binance.market.placeMarketOrderByQuoteAmount({
          symbol,
          side,
          quoteOrderQty,
        })
      : await binance.market.placeMarketOrder({
          symbol,
          side,
          quantity: quantity as string,
        });

    return NextResponse.json(order, { status: 200 });
  } catch (error) {
    return handleBinanceRouteError(error);
  }
}
