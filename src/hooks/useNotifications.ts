'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { getNotificationsSummaryAction } from '@/app/actions/notifications';
import { useAuth } from '@/hooks/useAuth';
import type { NotificationItem } from '@/lib/notifications/types';

const READ_STORAGE_PREFIX = 'hili.notifications.read.';
const POLL_INTERVAL_MS = 60_000;

function loadStoredFingerprints(storageKey: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === 'string'));
  } catch {
    return new Set();
  }
}

function persistFingerprints(storageKey: string, fingerprints: Set<string>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey, JSON.stringify([...fingerprints]));
}

export function useNotifications() {
  const { session, isAuthorized, profile } = useAuth();
  const accessToken = session?.access_token ?? null;
  const storageKey = `${READ_STORAGE_PREFIX}${profile?.email ?? session?.user?.email ?? 'anon'}`;

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readFingerprints, setReadFingerprints] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setReadFingerprints(loadStoredFingerprints(storageKey));
  }, [storageKey]);

  const refresh = useCallback(async () => {
    if (!accessToken || !isAuthorized) {
      setItems([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await getNotificationsSummaryAction(accessToken);
      if (!result.ok) {
        setError(result.message);
        setItems([]);
        return;
      }
      setItems(result.data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, isAuthorized]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!accessToken || !isAuthorized) return;

    const timer = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);

    const onFocus = () => {
      void refresh();
    };

    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [accessToken, isAuthorized, refresh]);

  const unreadCount = useMemo(
    () => items.filter((item) => !readFingerprints.has(item.fingerprint)).length,
    [items, readFingerprints],
  );

  const markAllRead = useCallback(() => {
    setReadFingerprints((current) => {
      const next = new Set(current);
      for (const item of items) {
        next.add(item.fingerprint);
      }
      persistFingerprints(storageKey, next);
      return next;
    });
  }, [items, storageKey]);

  const markRead = useCallback(
    (fingerprint: string) => {
      setReadFingerprints((current) => {
        if (current.has(fingerprint)) return current;
        const next = new Set(current);
        next.add(fingerprint);
        persistFingerprints(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const isUnread = useCallback(
    (item: NotificationItem) => !readFingerprints.has(item.fingerprint),
    [readFingerprints],
  );

  return {
    items,
    isLoading,
    error,
    unreadCount,
    isUnread,
    markRead,
    markAllRead,
    refresh,
  };
}
