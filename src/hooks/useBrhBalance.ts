'use client';

import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/integrations/supabase/client';

export type UseBrhBalanceResult = {
  balance: string;
  balanceNumber: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

/** Loads BRH singleton balance + subscribes to Supabase Realtime updates (fallback polling if needed). */
export function useBrhBalance(): UseBrhBalanceResult {
  const [balance, setBalance] = useState<string>('0');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch('/api/brh/balance', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { balance?: string };
      setBalance(typeof json.balance === 'string' ? json.balance : '0');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'fetch failed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBalance();

    const channel = supabase
      .channel('brh-balance-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'brh_balance' },
        () => {
          void fetchBalance();
        },
      )
      .subscribe();

    const interval = window.setInterval(() => {
      void fetchBalance();
    }, 25_000);

    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [fetchBalance]);

  const n = Number(balance);
  const balanceNumber = Number.isFinite(n) ? n : 0;

  return { balance, balanceNumber, isLoading, error, refetch: fetchBalance };
}
