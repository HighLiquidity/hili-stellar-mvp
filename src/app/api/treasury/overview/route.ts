import { NextResponse } from 'next/server';

import { buildTreasuryOverview } from '@/lib/treasury/overview';

import { handleTreasuryRouteError, requireTreasuryRouteAdmin } from '../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Admin-only aggregate of proprietary capital pockets + pending on-ramp refills. */
export async function GET(request: Request) {
  const authError = await requireTreasuryRouteAdmin(request);
  if (authError) return authError;

  try {
    const overview = await buildTreasuryOverview();
    return NextResponse.json(overview, { status: 200 });
  } catch (error) {
    return handleTreasuryRouteError(error);
  }
}
