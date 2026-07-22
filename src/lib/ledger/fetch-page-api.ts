import type { LedgerQueryFilters } from './filters';
import type { FetchLedgerPageResult } from './query-entries';

function buildStatementSearchParams(
  filters: LedgerQueryFilters,
  page: number,
  pageSize: number,
): URLSearchParams {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    type: filters.type,
  });

  if (filters.dateFrom?.trim()) {
    params.set('dateFrom', filters.dateFrom.trim());
  }
  if (filters.dateTo?.trim()) {
    params.set('dateTo', filters.dateTo.trim());
  }

  return params;
}

export async function fetchLedgerPageFromApi(
  accessToken: string,
  filters: LedgerQueryFilters,
  page: number,
  pageSize: number,
): Promise<FetchLedgerPageResult> {
  const params = buildStatementSearchParams(filters, page, pageSize);
  const response = await fetch(`/api/ledger/statement?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const payload = (await response.json()) as
    | FetchLedgerPageResult
    | { error?: string; message?: string };

  if (!response.ok) {
    const message =
      ('error' in payload && payload.error) ||
      ('message' in payload && payload.message) ||
      `HTTP ${response.status}`;
    return { ok: false, message };
  }

  return payload as FetchLedgerPageResult;
}
