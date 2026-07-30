import { NextResponse } from 'next/server';

import {
  buildTreasuryOverview,
  buildTreasuryPocket,
  isTreasuryPocketId,
} from '@/lib/treasury/overview';

import { handleTreasuryRouteError, jsonError, requireTreasuryRouteAdmin } from '../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Admin-only aggregate of proprietary capital pockets + pending on-ramp refills.
 *  Pass `?pocket=corpx|binance|distributor|brh` to refresh a single card balance.
 */
export async function GET(request: Request) {
  const authError = await requireTreasuryRouteAdmin(request);
  if (authError) return authError;

  try {
    const pocketParam = new URL(request.url).searchParams.get('pocket')?.trim().toLowerCase();
    if (pocketParam) {
      if (!isTreasuryPocketId(pocketParam)) {
        return jsonError('pocket must be corpx, binance, distributor, or brh', 400);
      }
      const pocket = await buildTreasuryPocket(pocketParam);
      return NextResponse.json(pocket, { status: 200 });
    }

    const overview = await buildTreasuryOverview();
    return NextResponse.json(overview, { status: 200 });
  } catch (error) {
    return handleTreasuryRouteError(error);
  }
}
