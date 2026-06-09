import '@/lib/server/only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

import type { PublicV1OrderListItem, PublicV1OrdersListResponse } from './v1-responses';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

type ListQuery = {
  userId: string;
  page?: number;
  pageSize?: number;
  status?: string;
  externalId?: string;
};

type OrderListDbRow = {
  id: string;
  integrator_external_id: string | null;
  status: string;
  amount_brl: string;
  amount_usdc: string;
  created_at: string;
  updated_at: string;
};

function mapRow(row: OrderListDbRow): PublicV1OrderListItem {
  return {
    orderId: row.id,
    externalId: row.integrator_external_id,
    status: row.status,
    amountBrl: row.amount_brl,
    amountUsdc: row.amount_usdc,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listOrdersForUser(
  table: 'onramp_orders' | 'offramp_orders',
  query: ListQuery,
): Promise<PublicV1OrdersListResponse> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  }

  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(Math.max(query.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const selectColumns =
    'id, integrator_external_id, status, amount_brl, amount_usdc, created_at, updated_at';

  let countQuery = admin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('created_by_user_id', query.userId);
  let dataQuery = admin
    .from(table)
    .select(selectColumns)
    .eq('created_by_user_id', query.userId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (query.status?.trim()) {
    const status = query.status.trim();
    countQuery = countQuery.eq('status', status);
    dataQuery = dataQuery.eq('status', status);
  }

  if (query.externalId?.trim()) {
    const externalId = query.externalId.trim();
    countQuery = countQuery.eq('integrator_external_id', externalId);
    dataQuery = dataQuery.eq('integrator_external_id', externalId);
  }

  const [{ count, error: countError }, { data, error: dataError }] = await Promise.all([
    countQuery,
    dataQuery,
  ]);

  if (countError) {
    throw new Error(countError.message);
  }
  if (dataError) {
    throw new Error(dataError.message);
  }

  return {
    orders: ((data ?? []) as OrderListDbRow[]).map(mapRow),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export function listV1OnrampOrdersForUser(query: ListQuery): Promise<PublicV1OrdersListResponse> {
  return listOrdersForUser('onramp_orders', query);
}

export function listV1OfframpOrdersForUser(query: ListQuery): Promise<PublicV1OrdersListResponse> {
  return listOrdersForUser('offramp_orders', query);
}
