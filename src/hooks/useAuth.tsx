'use client';

import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../integrations/supabase/client';
import { sessionNeedsMfaChallenge } from '../lib/auth/aal';
import {
  getAuthErrorMessage,
  getAuthorizedAccessProfile,
  getCurrentSession,
  getMfaAssurance,
  signOutUser,
  type AccessProfile,
} from '../lib/authService';
import { getPlatformRampFlagsAction } from '@/app/actions/admin-settings';
import type { PlatformRampFlags } from '@/lib/admin-test-settings/types';

const DEFAULT_RAMP_FLAGS: PlatformRampFlags = {
  usdcRampEnabled: true,
  brhRampEnabled: true,
};

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: AccessProfile | null;
  isAuthenticated: boolean;
  isAuthorized: boolean;
  needsMfa: boolean;
  isLoading: boolean;
  authError: string | null;
  rampFlags: PlatformRampFlags;
  refreshRampFlags: () => Promise<void>;
  clearAuthError: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AccessProfile | null>(null);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [rampFlags, setRampFlags] = useState<PlatformRampFlags>(DEFAULT_RAMP_FLAGS);
  const keepNextSignedOutErrorRef = useRef(false);

  const loadRampFlags = async (accessToken: string | undefined) => {
    if (!accessToken) {
      setRampFlags(DEFAULT_RAMP_FLAGS);
      return;
    }
    try {
      const result = await getPlatformRampFlagsAction(accessToken);
      if (result.ok) {
        setRampFlags(result.data);
      }
    } catch {
      setRampFlags(DEFAULT_RAMP_FLAGS);
    }
  };

  useEffect(() => {
    let isMounted = true;

    async function syncSession(nextSession: Session | null) {
      if (!isMounted) {
        return;
      }

      if (!nextSession?.user.email) {
        setSession(null);
        setProfile(null);
        setNeedsMfa(false);
        setRampFlags(DEFAULT_RAMP_FLAGS);
        if (!keepNextSignedOutErrorRef.current) {
          setAuthError(null);
        }
        keepNextSignedOutErrorRef.current = false;
        setIsLoading(false);
        return;
      }

      setSession(nextSession);

      try {
        const accessProfile = await getAuthorizedAccessProfile(nextSession.user.email);

        if (!accessProfile || !accessProfile.is_active) {
          setProfile(null);
          setNeedsMfa(false);
          setRampFlags(DEFAULT_RAMP_FLAGS);
          setAuthError('access_denied');
          keepNextSignedOutErrorRef.current = true;
          await signOutUser();
          if (!isMounted) {
            return;
          }
          setSession(null);
          setIsLoading(false);
          return;
        }

        let pendingMfa = false;
        try {
          const assurance = await getMfaAssurance();
          pendingMfa = sessionNeedsMfaChallenge(assurance.currentLevel, assurance.nextLevel);
        } catch {
          pendingMfa = false;
        }

        if (!isMounted) {
          return;
        }

        setProfile(accessProfile);
        setNeedsMfa(pendingMfa);
        setAuthError(null);
        void loadRampFlags(nextSession.access_token);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setProfile(null);
        setNeedsMfa(false);
        setAuthError(getAuthErrorMessage(error));
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    async function initializeAuth() {
      try {
        const currentSession = await getCurrentSession();
        await syncSession(currentSession);
      } catch (error) {
        if (isMounted) {
          setAuthError(getAuthErrorMessage(error));
          setIsLoading(false);
        }
      }
    }

    initializeAuth();

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      window.setTimeout(() => {
        if (event === 'SIGNED_OUT') {
          if (isMounted) {
            setSession(null);
            setProfile(null);
            setNeedsMfa(false);
            setRampFlags(DEFAULT_RAMP_FLAGS);
            if (!keepNextSignedOutErrorRef.current) {
              setAuthError(null);
            }
            keepNextSignedOutErrorRef.current = false;
            setIsLoading(false);
          }
          return;
        }

        void syncSession(nextSession);
      }, 0);
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      isAuthenticated: Boolean(session),
      isAuthorized: Boolean(session && profile?.is_active && !needsMfa),
      needsMfa,
      isLoading,
      authError,
      rampFlags,
      refreshRampFlags: async () => {
        await loadRampFlags(session?.access_token);
      },
      clearAuthError: () => {
        keepNextSignedOutErrorRef.current = false;
        setAuthError(null);
      },
      logout: async () => {
        try {
          keepNextSignedOutErrorRef.current = false;
          await signOutUser();
          setSession(null);
          setProfile(null);
          setNeedsMfa(false);
          setRampFlags(DEFAULT_RAMP_FLAGS);
          setAuthError(null);
        } catch (error) {
          setAuthError(getAuthErrorMessage(error));
        }
      },
    }),
    [authError, isLoading, needsMfa, profile, rampFlags, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}