import type { SupabaseClient } from '@supabase/supabase-js';

import {
  FIAT_LEDGER_ENTRIES_TABLE,
  OFFRAMP_ORDERS_TABLE,
  ONRAMP_ORDERS_TABLE,
  RAMP_OPERATIONS_TABLE,
} from './db-tables';

import { dateInputToEndIso, dateInputToStartIso, type LedgerQueryFilters } from './filters';
import { mapLedgerRowsToTransactions } from './map-entries';
import {
  mapOfframpOrdersToTransactions,
  mapOnrampOrdersToTransactions,
  paginateStatementTransactions,
  sortStatementTransactions,
  type OfframpStatementRow,
  type OnrampStatementRow,
} from './map-ramp-orders';
import type { FiatLedgerEntryRow, LedgerTransaction } from './types';

const LEDGER_SELECT =
  'id, created_at, entry_type, amount_brl, status, source_id, pix_e2e_id, ramp_external_id, beneficiary_name';

const ONRAMP_STATEMENT_SELECT =
  'id, amount_brl, amount_usdc, pix_received_at, end_to_end_id, usdc_delivery_tx_hash, destination_address';

const OFFRAMP_STATEMENT_SELECT =
  'id, amount_brl, amount_usdc, pix_sent_at, payout_end_to_end_id, payout_beneficiary_name, usdc_received_tx_hash';

/** Max ramp rows loaded per source before merge (statement export caps total separately). */
export const STATEMENT_RAMP_FETCH_LIMIT = 2500;

export type FetchLedgerPageResult =
  | { ok: true; transactions: LedgerTransaction[]; total: number }
  | { ok: false; message: string };

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyOnrampStatementFilters(query: any, filters: LedgerQueryFilters) {
  let q = query.not('pix_received_at', 'is', null);
  if (filters.dateFrom?.trim()) {
    q = q.gte('pix_received_at', dateInputToStartIso(filters.dateFrom.trim()));
  }
  if (filters.dateTo?.trim()) {
    q = q.lte('pix_received_at', dateInputToEndIso(filters.dateTo.trim()));
  }
  return q;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyOfframpStatementFilters(query: any, filters: LedgerQueryFilters) {
  let q = query.not('pix_sent_at', 'is', null);
  if (filters.dateFrom?.trim()) {
    q = q.gte('pix_sent_at', dateInputToStartIso(filters.dateFrom.trim()));
  }
  if (filters.dateTo?.trim()) {
    q = q.lte('pix_sent_at', dateInputToEndIso(filters.dateTo.trim()));
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
    console.warn('[ledger/statement] ramp tx_hash fetch failed', error.message);
    return rampByExternalId;
  }

  for (const r of rampRows ?? []) {
    const row = r as { external_id: string; tx_hash: string | null };
    rampByExternalId.set(row.external_id, row.tx_hash?.trim() || null);
  }
  return rampByExternalId;
}

async function fetchLedgerRows(
  client: SupabaseClient,
  filters: LedgerQueryFilters,
  includeLedger: boolean,
): Promise<FiatLedgerEntryRow[]> {
  if (!includeLedger) return [];

  let query = client
    .from(FIAT_LEDGER_ENTRIES_TABLE)
    .select(LEDGER_SELECT)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(STATEMENT_RAMP_FETCH_LIMIT);

  query = applyLedgerFilters(query, filters);

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as FiatLedgerEntryRow[];
}

async function fetchOnrampStatementRows(
  client: SupabaseClient,
  filters: LedgerQueryFilters,
  includeOnramp: boolean,
): Promise<OnrampStatementRow[]> {
  if (!includeOnramp) return [];

  let query = client
    .from(ONRAMP_ORDERS_TABLE)
    .select(ONRAMP_STATEMENT_SELECT)
    .order('pix_received_at', { ascending: false })
    .limit(STATEMENT_RAMP_FETCH_LIMIT);

  query = applyOnrampStatementFilters(query, filters);

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as OnrampStatementRow[];
}

async function fetchOfframpStatementRows(
  client: SupabaseClient,
  filters: LedgerQueryFilters,
  includeOfframp: boolean,
): Promise<OfframpStatementRow[]> {
  if (!includeOfframp) return [];

  let query = client
    .from(OFFRAMP_ORDERS_TABLE)
    .select(OFFRAMP_STATEMENT_SELECT)
    .order('pix_sent_at', { ascending: false })
    .limit(STATEMENT_RAMP_FETCH_LIMIT);

  query = applyOfframpStatementFilters(query, filters);

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as OfframpStatementRow[];
}

export async function fetchStatementPage(
  client: SupabaseClient,
  filters: LedgerQueryFilters,
  page: number,
  pageSize: number,
): Promise<FetchLedgerPageResult> {
  const includeLedger = filters.type === 'all' || filters.type === 'deposit' || filters.type === 'withdraw';
  const includeOnramp = filters.type === 'all' || filters.type === 'deposit';
  const includeOfframp = filters.type === 'all' || filters.type === 'withdraw';

  try {
    const [ledgerRows, onrampRows, offrampRows] = await Promise.all([
      fetchLedgerRows(client, filters, includeLedger),
      fetchOnrampStatementRows(client, filters, includeOnramp),
      fetchOfframpStatementRows(client, filters, includeOfframp),
    ]);

    const rampByExternalId = await loadRampHashes(client, ledgerRows);

    const ledgerTx =
      filters.type === 'withdraw'
        ? mapLedgerRowsToTransactions(
            ledgerRows.filter((row) => row.entry_type === 'withdraw'),
            rampByExternalId,
          )
        : filters.type === 'deposit'
          ? mapLedgerRowsToTransactions(
              ledgerRows.filter((row) => row.entry_type === 'deposit'),
              rampByExternalId,
            )
          : mapLedgerRowsToTransactions(ledgerRows, rampByExternalId);

    const merged = sortStatementTransactions([
      ...ledgerTx,
      ...mapOnrampOrdersToTransactions(onrampRows),
      ...mapOfframpOrdersToTransactions(offrampRows),
    ]);

    const { pageRows, total } = paginateStatementTransactions(merged, page, pageSize);

    return { ok: true, transactions: pageRows, total };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, message };
  }
}

export async function fetchStatementForExport(
  client: SupabaseClient,
  filters: LedgerQueryFilters,
  maxRows: number,
): Promise<FetchLedgerPageResult> {
  return fetchStatementPage(client, filters, 1, maxRows);
}
