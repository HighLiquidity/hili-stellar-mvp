import { NextResponse } from 'next/server';

import { binance } from '@/lib/server/binance';

import { badRequest, handleBinanceRouteError, requireBinanceRouteAdmin } from '../../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Internal admin-only fiat order detail probe.
 * Primary smoke endpoint to inspect PIX/EMV fields after createFiatDeposit.
 */
export async function GET(request: Request) {
  const authError = await requireBinanceRouteAdmin(request);
  if (authError) return authError;

  try {
    const url = new URL(request.url);
    const orderNo = url.searchParams.get('orderNo')?.trim();
    if (!orderNo) {
      return badRequest('orderNo query parameter is required');
    }

    const order = await binance.fiat.getOrderDetail(orderNo);
    return NextResponse.json({ order }, { status: 200 });
  } catch (error) {
    return handleBinanceRouteError(error);
  }
}
