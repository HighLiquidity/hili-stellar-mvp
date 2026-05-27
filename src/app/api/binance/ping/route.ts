import { NextResponse } from 'next/server';

import { binance } from '@/lib/server/binance';

import { handleBinanceRouteError, requireBinanceRouteAdmin } from '../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Internal admin-only connectivity check for the Binance REST API. */
export async function GET(request: Request) {
  const authError = await requireBinanceRouteAdmin(request);
  if (authError) return authError;

  try {
    const result = await binance.health.ping();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleBinanceRouteError(error);
  }
}
