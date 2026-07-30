import { NextResponse } from 'next/server';

import { binance } from '@/lib/server/binance';

import { badRequest, handleBinanceRouteError, requireBinanceRouteAdmin } from '../../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Internal admin-only fiat deposit/withdraw history probe.
 * Query: transactionType=0 (deposit) | 1 (withdraw); optional page, rows, beginTime, endTime.
 */
export async function GET(request: Request) {
  const authError = await requireBinanceRouteAdmin(request);
  if (authError) return authError;

  try {
    const url = new URL(request.url);
    const transactionTypeRaw = url.searchParams.get('transactionType') ?? '0';
    const transactionType = Number(transactionTypeRaw);
    if (transactionType !== 0 && transactionType !== 1) {
      return badRequest('transactionType must be 0 (deposit) or 1 (withdraw)');
    }

    const pageRaw = url.searchParams.get('page');
    const rowsRaw = url.searchParams.get('rows');
    const beginTimeRaw = url.searchParams.get('beginTime');
    const endTimeRaw = url.searchParams.get('endTime');

    const orders = await binance.fiat.getOrders({
      transactionType: transactionType as 0 | 1,
      page: pageRaw ? Number(pageRaw) : undefined,
      rows: rowsRaw ? Number(rowsRaw) : undefined,
      beginTime: beginTimeRaw ? Number(beginTimeRaw) : undefined,
      endTime: endTimeRaw ? Number(endTimeRaw) : undefined,
    });

    return NextResponse.json({ orders }, { status: 200 });
  } catch (error) {
    return handleBinanceRouteError(error);
  }
}
