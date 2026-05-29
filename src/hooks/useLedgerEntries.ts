'use client';

import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/integrations/supabase/client';
import {
  defaultStatementDateFrom,
  defaultStatementDateTo,
  type LedgerQueryFilters,
} from '@/lib/ledger/filters';
import { fetchLedgerPage } from '@/lib/ledger/query-entries';
import type { LedgerTransaction } from '@/lib/ledger/types';
import {
  FIAT_LEDGER_ENTRIES_TABLE,
  OFFRAMP_ORDERS_TABLE,
  ONRAMP_ORDERS_TABLE,
  RAMP_OPERATIONS_TABLE,
} from '@/lib/ledger/db-tables';
import { sumLedgerVolumes, sumUsdcVolumes } from '@/lib/ledger/volumes';

export type UseLedgerEntriesResult = {
  transactions: LedgerTransaction[];
  incomingBrl: number;
  outgoingBrl: number;
  usdcReceived: number;
  usdcSent: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

const DASHBOARD_LEDGER_FILTERS: LedgerQueryFilters = {
  dateFrom: defaultStatementDateFrom(),
  dateTo: defaultStatementDateTo(),
  type: 'all',
};

export function useLedgerEntries(limit = 50): UseLedgerEntriesResult {
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const capped = Math.min(Math.max(limit, 1), 500);
      const result = await fetchLedgerPage(supabase, DASHBOARD_LEDGER_FILTERS, 1, capped);

      if (!result.ok) {
        throw new Error(result.message);
      }

      setTransactions(result.transactions);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTransactions([]);
    } finally {
      setIsLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    void fetchEntries();

    const channel = supabase
      .channel('dashboard-ledger-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: FIAT_LEDGER_ENTRIES_TABLE },
        () => {
          void fetchEntries();
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: RAMP_OPERATIONS_TABLE },
        () => {
          void fetchEntries();
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: ONRAMP_ORDERS_TABLE },
        () => {
          void fetchEntries();
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: OFFRAMP_ORDERS_TABLE },
        () => {
          void fetchEntries();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchEntries]);

  const { incomingBrl, outgoingBrl } = sumLedgerVolumes(transactions);
  const { usdcReceived, usdcSent } = sumUsdcVolumes(transactions);

  return {
    transactions,
    incomingBrl,
    outgoingBrl,
    usdcReceived,
    usdcSent,
    isLoading,
    error,
    refetch: fetchEntries,
  };
}
