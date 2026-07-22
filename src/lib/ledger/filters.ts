import type { LedgerEntryType } from './types';

export type LedgerTypeFilter = 'all' | LedgerEntryType;

export type LedgerQueryFilters = {
  dateFrom?: string;
  dateTo?: string;
  type: LedgerTypeFilter;
  /** When set, filters tenant-scoped ramp order sources (on-ramp / off-ramp). */
  clientId?: string;
};

/** Local calendar date `yyyy-mm-dd` → start of day ISO. */
export function dateInputToStartIso(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map((p) => Number(p));
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

/** Local calendar date `yyyy-mm-dd` → end of day ISO. */
export function dateInputToEndIso(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map((p) => Number(p));
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

export function defaultStatementDateFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 180);
  return d.toISOString().slice(0, 10);
}

export function defaultStatementDateTo(): string {
  return new Date().toISOString().slice(0, 10);
}

export const STATEMENT_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
export type StatementPageSize = (typeof STATEMENT_PAGE_SIZE_OPTIONS)[number];

export const STATEMENT_EXPORT_MAX_ROWS = 5000;
