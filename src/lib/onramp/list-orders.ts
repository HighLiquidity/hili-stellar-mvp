import '@/lib/server/only';

import { dateInputToEndIso, dateInputToStartIso } from '@/lib/ledger/filters';
import type { RampOrderListItem, RampOrdersListQuery, RampOrdersListResponse } from '@/lib/ramp/list-contracts';
import { createSupabaseAdmin } from '@/lib/supabase/admin';

import { OnrampConfigError } from './errors';
import { ONRAMP_ORDERS_TABLE, type OnrampOrderStatus } from './order-store';

const LIST_SELECT =
  'id, status, amount_brl, amount_usdc, created_at, updated_at, quoted_at, pix_received_at, usdc_delivered_at, destination_address';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function mapRow(row: {
  id: string;
  status: string;
  amount_brl: string;
  amount_usdc: string;
  created_at: string;
  updated_at: string;
  quoted_at: string;
  pix_received_at: string | null;
  usdc_delivered_at: string | null;
  destination_address: string;
}): RampOrderListItem {
  return {
    flow: 'onramp',
    orderId: row.id,
    status: row.status,
    amountBrl: row.amount_brl,
    amountUsdc: row.amount_usdc,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    quotedAt: row.quoted_at,
    pixReceivedAt: row.pix_received_at,
    pixSentAt: null,
    usdcDeliveredAt: row.usdc_delivered_at,
    counterpartLabel: row.destination_address?.trim() || null,
  };
}

export async function listOnrampOrders(query: RampOrdersListQuery = {}): Promise<RampOrdersListResponse> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    throw new OnrampConfigError('SUPABASE_SERVICE_ROLE_KEY missing');
  }

  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(Math.max(query.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let countQuery = admin.from(ONRAMP_ORDERS_TABLE).select('*', { count: 'exact', head: true });
  let dataQuery = admin
    .from(ONRAMP_ORDERS_TABLE)
    .select(LIST_SELECT)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (query.status?.trim()) {
    const status = query.status.trim() as OnrampOrderStatus;
    countQuery = countQuery.eq('status', status);
    dataQuery = dataQuery.eq('status', status);
  }

  if (query.dateFrom?.trim()) {
    const iso = dateInputToStartIso(query.dateFrom.trim());
    countQuery = countQuery.gte('created_at', iso);
    dataQuery = dataQuery.gte('created_at', iso);
  }

  if (query.dateTo?.trim()) {
    const iso = dateInputToEndIso(query.dateTo.trim());
    countQuery = countQuery.lte('created_at', iso);
    dataQuery = dataQuery.lte('created_at', iso);
  }

  const [{ count, error: countError }, { data, error: dataError }] = await Promise.all([
    countQuery,
    dataQuery,
  ]);

  if (countError) {
    throw new OnrampConfigError(countError.message);
  }
  if (dataError) {
    throw new OnrampConfigError(dataError.message);
  }

  return {
    orders: (data ?? []).map((row) => mapRow(row as Parameters<typeof mapRow>[0])),
    total: count ?? 0,
    page,
    pageSize,
  };
}
