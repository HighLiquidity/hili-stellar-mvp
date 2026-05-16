import { NextResponse } from 'next/server';

import { readBrhBalanceAdmin } from '@/lib/brh/balance-store';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * Current BRH balance (singleton row). Uses service role server-side so the value matches webhook credits.
 */
export async function GET() {
  const persisted = Boolean(createSupabaseAdmin());
  const balance = await readBrhBalanceAdmin();
  return NextResponse.json({
    balance,
    /** False when `SUPABASE_SERVICE_ROLE_KEY` / URL are missing — balance stays at `"0"`. */
    persisted,
  });
}
