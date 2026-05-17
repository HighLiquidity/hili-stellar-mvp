import type { SupabaseClient } from '@supabase/supabase-js';

import { RAMP_OPERATIONS_TABLE } from '@/lib/ramp/operation-store';

import { dateInputToEndIso, dateInputToStartIso, type LedgerQueryFilters } from './filters';
import { mapLedgerRowsToTransactions } from './map-entries';
import type { FiatLedgerEntryRow, LedgerTransaction } from './types';
import { FIAT_LEDGER_ENTRIES_TABLE } from './types';

const LEDGER_SELECT =
  'id, created_at, entry_type, amount_brl, status, source_id, pix_e2e_id, ramp_external_id, beneficiary_name';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyLedgerFilters(query: any, filters: LedgerQueryFilters) {
  let q = query;
  if (filters.dateFrom?.trim()) {
    q = q.gte('created_at', dateInputToStartIso(filters.dateFrom.trim()));
  }
  if (filters.dateTo?.trim()) {
    q = q.lte('created_at', dateInputToEndIso(filters.dateTo.trim()));
  }
  if (filters.type !== 'all') {
    q = q.eq('entry_type', filters.type);
  }
  return q;
}

async function loadRampHashes(
  client: SupabaseClient,
  rows: FiatLedgerEntryRow[],
): Promise<Map<string, string | null>> {
  const externalIds = [
    ...new Set(rows.map((r) => r.ramp_external_id).filter((id): id is string => Boolean(id?.trim()))),
  ];
  const rampByExternalId = new Map<string, string | null>();
  if (externalIds.length === 0) return rampByExternalId;

  const { data: rampRows, error } = await client
    .from(RAMP_OPERATIONS_TABLE)
    .select('external_id, tx_hash')
    .in('external_id', externalIds);

  if (error) {
    console.warn('[ledger/query] ramp tx_hash fetch failed', error.message);
    return rampByExternalId;
  }

  for (const r of rampRows ?? []) {
    const row = r as { external_id: string; tx_hash: string | null };
    rampByExternalId.set(row.external_id, row.tx_hash?.trim() || null);
  }
  return rampByExternalId;
}

export type FetchLedgerPageResult =
  | { ok: true; transactions: LedgerTransaction[]; total: number }
  | { ok: false; message: string };

export async function fetchLedgerPage(
  client: SupabaseClient,
  filters: LedgerQueryFilters,
  page: number,
  pageSize: number,
): Promise<FetchLedgerPageResult> {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(Math.max(pageSize, 1), 100);
  const from = (safePage - 1) * safeSize;
  const to = from + safeSize - 1;

  let countQuery = client
    .from(FIAT_LEDGER_ENTRIES_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('status', 'completed');

  countQuery = applyLedgerFilters(countQuery, filters);

  const { count, error: countError } = await countQuery;
  if (countError) {
    return { ok: false, message: countError.message };
  }

  let dataQuery = client
    .from(FIAT_LEDGER_ENTRIES_TABLE)
    .select(LEDGER_SELECT)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .range(from, to);

  dataQuery = applyLedgerFilters(dataQuery, filters);

  const { data, error: dataError } = await dataQuery;
  if (dataError) {
    return { ok: false, message: dataError.message };
  }

  const rows = (data ?? []) as FiatLedgerEntryRow[];
  const rampByExternalId = await loadRampHashes(client, rows);

  return {
    ok: true,
    transactions: mapLedgerRowsToTransactions(rows, rampByExternalId),
    total: count ?? 0,
  };
}

export async function fetchLedgerForExport(
  client: SupabaseClient,
  filters: LedgerQueryFilters,
  maxRows: number,
): Promise<FetchLedgerPageResult> {
  return fetchLedgerPage(client, filters, 1, maxRows);
}
