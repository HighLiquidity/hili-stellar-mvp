'use client';

import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/** @deprecated Prefer ThemePreference — kept for callers that mean resolved theme. */
export type Theme = ResolvedTheme;

interface ThemeContextValue {
  /** Stored preference: light, dark, or follow OS. */
  preference: ThemePreference;
  /** Effective theme applied to the document. */
  resolvedTheme: ResolvedTheme;
  /** Alias of resolvedTheme (backward compatible). */
  theme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  setTheme: (theme: ResolvedTheme) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = 'fiat-ops.theme';
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function readSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') {
    return 'system';
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }

  return 'system';
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? readSystemTheme() : preference;
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');

  useEffect(() => {
    const initial = readStoredPreference();
    setPreferenceState(initial);
    setResolvedTheme(resolveTheme(initial));
  }, []);

  useEffect(() => {
    const apply = () => setResolvedTheme(resolveTheme(preference));
    apply();

    if (preference !== 'system' || typeof window === 'undefined') {
      return;
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, preference);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
  }, []);

  const setTheme = useCallback((next: ResolvedTheme) => {
    setPreferenceState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setPreferenceState((current) => {
      const effective = current === 'system' ? readSystemTheme() : current;
      return effective === 'light' ? 'dark' : 'light';
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolvedTheme,
      theme: resolvedTheme,
      setPreference,
      setTheme,
      toggleTheme,
    }),
    [preference, resolvedTheme, setPreference, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }

  return context;
}
