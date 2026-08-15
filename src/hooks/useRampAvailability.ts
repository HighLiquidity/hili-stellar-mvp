import { useAuth } from '@/hooks/useAuth';
import { isOperatorOrAdminRole } from '@/lib/users/panel-access';

export function useUsdcRampAccess() {
  const { profile, rampFlags, isLoading, isAuthorized } = useAuth();
  return {
    canAccess: isOperatorOrAdminRole(profile?.role) && rampFlags.usdcRampEnabled,
    authLoading: isLoading,
    isAuthorized,
  };
}

export function useBrhRampAccess() {
  const { rampFlags, isLoading, isAuthorized } = useAuth();
  return {
    canAccess: rampFlags.brhRampEnabled,
    authLoading: isLoading,
    isAuthorized,
  };
}
