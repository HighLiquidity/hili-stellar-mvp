import type { SupabaseClient } from '@supabase/supabase-js';

import type { LedgerQueryFilters } from './filters';
import {
  fetchStatementForExport,
  fetchStatementPage,
  type FetchLedgerPageResult,
} from './query-statement';

export type { FetchLedgerPageResult };

/** Statement page: fiat ledger + on-ramp PIX in + off-ramp PIX out. */
export async function fetchLedgerPage(
  client: SupabaseClient,
  filters: LedgerQueryFilters,
  page: number,
  pageSize: number,
): Promise<FetchLedgerPageResult> {
  return fetchStatementPage(client, filters, page, pageSize);
}

export async function fetchLedgerForExport(
  client: SupabaseClient,
  filters: LedgerQueryFilters,
  maxRows: number,
): Promise<FetchLedgerPageResult> {
  return fetchStatementForExport(client, filters, maxRows);
}
