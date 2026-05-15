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
import {
  getAuthErrorMessage,
  getAuthorizedAccessProfile,
  getCurrentSession,
  signOutUser,
  type AccessProfile,
} from '../lib/authService';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: AccessProfile | null;
  isAuthenticated: boolean;
  isAuthorized: boolean;
  isLoading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AccessProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const keepNextSignedOutErrorRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    async function syncSession(nextSession: Session | null) {
      if (!isMounted) {
        return;
      }

      if (!nextSession?.user.email) {
        setSession(null);
        setProfile(null);
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

        if (!isMounted) {
          return;
        }

        setProfile(accessProfile);
        setAuthError(null);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setProfile(null);
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
      if (event === 'SIGNED_OUT') {
        if (isMounted) {
          setSession(null);
          setProfile(null);
          if (!keepNextSignedOutErrorRef.current) {
            setAuthError(null);
          }
          keepNextSignedOutErrorRef.current = false;
          setIsLoading(false);
        }
        return;
      }

      void syncSession(nextSession);
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
      isAuthorized: Boolean(session && profile?.is_active),
      isLoading,
      authError,
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
          setAuthError(null);
        } catch (error) {
          setAuthError(getAuthErrorMessage(error));
        }
      },
    }),
    [authError, isLoading, profile, session],
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