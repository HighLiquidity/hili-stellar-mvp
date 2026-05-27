import { NextResponse } from 'next/server';

import { binance } from '@/lib/server/binance';

import { badRequest, handleBinanceRouteError, requireBinanceRouteAdmin } from '../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Internal admin-only ticker probe for Binance public market data. */
export async function GET(request: Request) {
  const authError = await requireBinanceRouteAdmin(request);
  if (authError) return authError;

  const symbol = new URL(request.url).searchParams.get('symbol')?.trim();
  if (!symbol) {
    return badRequest('symbol is required');
  }

  try {
    const ticker = await binance.market.getTickerPrice(symbol);
    return NextResponse.json(ticker, { status: 200 });
  } catch (error) {
    return handleBinanceRouteError(error);
  }
}
