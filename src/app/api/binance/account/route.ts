import { NextResponse } from 'next/server';

import { binance } from '@/lib/server/binance';

import { handleBinanceRouteError, requireBinanceRouteAdmin } from '../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Internal admin-only account probe for signed Binance account access. */
export async function GET(request: Request) {
  const authError = await requireBinanceRouteAdmin(request);
  if (authError) return authError;

  try {
    const client = binance.client.create();
    const account = await binance.account.getAccountInfo(client);
    const nonZeroBalances = binance.account.filterNonZeroBalances(account.balances);

    return NextResponse.json(
      {
        account,
        nonZeroBalances,
      },
      { status: 200 },
    );
  } catch (error) {
    return handleBinanceRouteError(error);
  }
}
