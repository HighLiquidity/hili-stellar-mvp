'use client';

import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/integrations/supabase/client';
import {
  defaultStatementDateFrom,
  defaultStatementDateTo,
  type LedgerQueryFilters,
  type StatementPageSize,
} from '@/lib/ledger/filters';
import { fetchLedgerPage } from '@/lib/ledger/query-entries';
import type { LedgerTransaction } from '@/lib/ledger/types';
import { FIAT_LEDGER_ENTRIES_TABLE } from '@/lib/ledger/types';
import { RAMP_OPERATIONS_TABLE } from '@/lib/ramp/operation-store';

export type UseStatementLedgerResult = {
  transactions: LedgerTransaction[];
  total: number;
  page: number;
  pageSize: StatementPageSize;
  filters: LedgerQueryFilters;
  setPage: (page: number) => void;
  setPageSize: (size: StatementPageSize) => void;
  setFilters: (patch: Partial<LedgerQueryFilters>) => void;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export function useStatementLedger(initialPageSize: StatementPageSize = 25): UseStatementLedgerResult {
  const [filters, setFiltersState] = useState<LedgerQueryFilters>({
    dateFrom: defaultStatementDateFrom(),
    dateTo: defaultStatementDateTo(),
    type: 'all',
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<StatementPageSize>(initialPageSize);
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setFilters = useCallback((patch: Partial<LedgerQueryFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }, []);

  const setPageSize = useCallback((size: StatementPageSize) => {
    setPageSizeState(size);
    setPage(1);
  }, []);

  const fetchPage = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchLedgerPage(supabase, filters, page, pageSize);
      if (!result.ok) {
        setError(result.message);
        setTransactions([]);
        setTotal(0);
        return;
      }
      setTransactions(result.transactions);
      setTotal(result.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTransactions([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [filters, page, pageSize]);

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  useEffect(() => {
    const channel = supabase
      .channel('statement-ledger-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: FIAT_LEDGER_ENTRIES_TABLE },
        () => {
          void fetchPage();
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: RAMP_OPERATIONS_TABLE },
        () => {
          void fetchPage();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchPage]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  return {
    transactions,
    total,
    page,
    pageSize,
    filters,
    setPage,
    setPageSize,
    setFilters,
    isLoading,
    error,
    refetch: fetchPage,
  };
}
