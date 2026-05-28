'use client';

import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/integrations/supabase/client';
import {
  FIAT_LEDGER_ENTRIES_TABLE,
  RAMP_OPERATIONS_TABLE,
} from '@/lib/ledger/db-tables';
import { mapLedgerRowsToTransactions } from '@/lib/ledger/map-entries';
import type { FiatLedgerEntryRow, LedgerTransaction } from '@/lib/ledger/types';
import { sumLedgerVolumes } from '@/lib/ledger/volumes';

export type UseLedgerEntriesResult = {
  transactions: LedgerTransaction[];
  incomingBrl: number;
  outgoingBrl: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export function useLedgerEntries(limit = 50): UseLedgerEntriesResult {
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    try {
      const capped = Math.min(Math.max(limit, 1), 200);

      const { data: entries, error: entriesError } = await supabase
        .from(FIAT_LEDGER_ENTRIES_TABLE)
        .select(
          'id, created_at, entry_type, amount_brl, status, source_id, pix_e2e_id, ramp_external_id, beneficiary_name',
        )
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(capped);

      if (entriesError) {
        throw new Error(entriesError.message);
      }

      const rows = (entries ?? []) as FiatLedgerEntryRow[];
      const externalIds = [
        ...new Set(rows.map((r) => r.ramp_external_id).filter((id): id is string => Boolean(id?.trim()))),
      ];

      const rampByExternalId = new Map<string, string | null>();
      if (externalIds.length > 0) {
        const { data: rampRows, error: rampError } = await supabase
          .from(RAMP_OPERATIONS_TABLE)
          .select('external_id, tx_hash')
          .in('external_id', externalIds);

        if (rampError) {
          console.warn('[useLedgerEntries] ramp tx_hash fetch failed', rampError.message);
        } else {
          for (const r of rampRows ?? []) {
            const row = r as { external_id: string; tx_hash: string | null };
            rampByExternalId.set(row.external_id, row.tx_hash?.trim() || null);
          }
        }
      }

      setTransactions(mapLedgerRowsToTransactions(rows, rampByExternalId));
      setError(null);
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
      .channel('fiat-ledger-updates')
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
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchEntries]);

  const { incomingBrl, outgoingBrl } = sumLedgerVolumes(transactions);

  return {
    transactions,
    incomingBrl,
    outgoingBrl,
    isLoading,
    error,
    refetch: fetchEntries,
  };
}
