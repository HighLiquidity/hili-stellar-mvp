'use client';

import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  type LedgerQueryFilters,
} from '@/lib/ledger/filters';
import { fetchLedgerPageFromApi } from '@/lib/ledger/fetch-page-api';
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

/** Dashboard recent activity: no date window — only capped by fetch limit. */
const DASHBOARD_LEDGER_FILTERS: LedgerQueryFilters = {
  type: 'all',
};

export function useLedgerEntries(limit = 50): UseLedgerEntriesResult {
  const { session, isLoading: authLoading, isAuthorized } = useAuth();
  const accessToken = session?.access_token ?? null;
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    if (authLoading) return;

    if (!accessToken || !isAuthorized) {
      setTransactions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const capped = Math.min(Math.max(limit, 1), 500);
      const result = await fetchLedgerPageFromApi(accessToken, DASHBOARD_LEDGER_FILTERS, 1, capped);

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
  }, [accessToken, authLoading, isAuthorized, limit]);

  useEffect(() => {
    void fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    if (!accessToken) return;

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
  }, [accessToken, fetchEntries]);

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
