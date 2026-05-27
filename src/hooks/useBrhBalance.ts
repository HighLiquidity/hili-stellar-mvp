'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '@/integrations/supabase/client';

export type UseBrhBalanceResult = {
  balance: string;
  balanceNumber: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

type BrhBalanceStoreState = {
  balance: string;
  isLoading: boolean;
  error: string | null;
};

const BALANCE_POLL_INTERVAL_MS = 60_000;
const BALANCE_FETCH_THROTTLE_MS = 5_000;

let storeState: BrhBalanceStoreState = {
  balance: '0',
  isLoading: true,
  error: null,
};
let hasLoadedOnce = false;
let activeFetch: Promise<void> | null = null;
let lastFetchStartedAt = 0;
let channel: RealtimeChannel | null = null;
let pollIntervalId: number | null = null;
let visibilityListenerAttached = false;
const listeners = new Set<() => void>();

function emitStoreChange() {
  listeners.forEach((listener) => listener());
}

function setStoreState(next: Partial<BrhBalanceStoreState>) {
  storeState = { ...storeState, ...next };
  emitStoreChange();
}

async function requestBalanceRefresh(options?: { force?: boolean }): Promise<void> {
  const force = options?.force ?? false;
  const now = Date.now();

  if (activeFetch) {
    return activeFetch;
  }

  if (
    !force &&
    hasLoadedOnce &&
    now - lastFetchStartedAt < BALANCE_FETCH_THROTTLE_MS
  ) {
    return;
  }

  if (!force && typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return;
  }

  lastFetchStartedAt = now;
  if (!hasLoadedOnce) {
    setStoreState({ isLoading: true });
  }

  activeFetch = (async () => {
    try {
      const res = await fetch('/api/brh/balance', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { balance?: string };
      hasLoadedOnce = true;
      setStoreState({
        balance: typeof json.balance === 'string' ? json.balance : '0',
        error: null,
        isLoading: false,
      });
    } catch (e) {
      hasLoadedOnce = true;
      setStoreState({
        error: e instanceof Error ? e.message : 'fetch failed',
        isLoading: false,
      });
    } finally {
      activeFetch = null;
    }
  })();

  return activeFetch;
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    void requestBalanceRefresh({ force: true });
  }
}

function startStore() {
  if (typeof window === 'undefined') {
    return;
  }

  if (!channel) {
    channel = supabase
      .channel('brh-balance-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'brh_balance' },
        () => {
          void requestBalanceRefresh({ force: true });
        },
      )
      .subscribe();
  }

  if (pollIntervalId == null) {
    pollIntervalId = window.setInterval(() => {
      void requestBalanceRefresh();
    }, BALANCE_POLL_INTERVAL_MS);
  }

  if (!visibilityListenerAttached) {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    visibilityListenerAttached = true;
  }

  if (!hasLoadedOnce) {
    void requestBalanceRefresh({ force: true });
  }
}

function stopStore() {
  if (listeners.size > 0 || typeof window === 'undefined') {
    return;
  }

  if (pollIntervalId != null) {
    window.clearInterval(pollIntervalId);
    pollIntervalId = null;
  }

  if (channel) {
    void supabase.removeChannel(channel);
    channel = null;
  }

  if (visibilityListenerAttached) {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    visibilityListenerAttached = false;
  }
}

/** Loads BRH singleton balance + subscribes to Supabase Realtime updates (fallback polling if needed). */
export function useBrhBalance(): UseBrhBalanceResult {
  const [state, setState] = useState<BrhBalanceStoreState>(storeState);

  const refetchBalance = useCallback(async () => {
    await requestBalanceRefresh({ force: true });
  }, []);

  useEffect(() => {
    const syncState = () => {
      setState(storeState);
    };

    listeners.add(syncState);
    startStore();
    syncState();

    return () => {
      listeners.delete(syncState);
      stopStore();
    };
  }, []);

  const n = Number(state.balance);
  const balanceNumber = Number.isFinite(n) ? n : 0;

  return {
    balance: state.balance,
    balanceNumber,
    isLoading: state.isLoading,
    error: state.error,
    refetch: refetchBalance,
  };
}
