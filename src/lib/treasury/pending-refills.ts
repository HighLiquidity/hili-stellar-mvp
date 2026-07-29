import '@/lib/server/only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

import { ONRAMP_ORDERS_TABLE } from '@/lib/onramp/order-store';

import type { TreasuryPendingRefillItem } from './types';

/** Post-delivery statuses still awaiting Binance FX / distributor refill completion. */
export const TREASURY_PENDING_REFILL_STATUSES = [
  'usdc_delivered',
  'needs_review',
  'fx_settled',
  'brh_redeemed',
] as const;

const PENDING_REFILL_LIMIT = 25;

export async function listPendingTreasuryRefills(): Promise<{
  count: number;
  items: TreasuryPendingRefillItem[];
}> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    return { count: 0, items: [] };
  }

  const statuses = [...TREASURY_PENDING_REFILL_STATUSES];

  const { count, error: countError } = await admin
    .from(ONRAMP_ORDERS_TABLE)
    .select('*', { count: 'exact', head: true })
    .in('status', statuses);

  if (countError) {
    console.error('[treasury] pending refill count failed', countError.message);
  }

  const { data, error } = await admin
    .from(ONRAMP_ORDERS_TABLE)
    .select('id, status, amount_brl, amount_usdc, updated_at, usdc_delivered_at')
    .in('status', statuses)
    .order('updated_at', { ascending: false })
    .limit(PENDING_REFILL_LIMIT);

  if (error) {
    console.error('[treasury] pending refill list failed', error.message);
    return { count: count ?? 0, items: [] };
  }

  const items: TreasuryPendingRefillItem[] = (data ?? []).map((row) => ({
    orderId: row.id,
    status: row.status,
    amountBrl: row.amount_brl,
    amountUsdc: row.amount_usdc,
    updatedAt: row.updated_at,
    usdcDeliveredAt: row.usdc_delivered_at ?? null,
  }));

  return {
    count: typeof count === 'number' ? count : items.length,
    items,
  };
}
