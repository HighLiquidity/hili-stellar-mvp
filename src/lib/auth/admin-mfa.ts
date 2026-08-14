import type { SupabaseClient } from '@supabase/supabase-js';

import { hasVerifiedTotpFactor, verifiedTotpFactors } from './factors';

export async function adminListMfaFactors(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
  if (error) {
    throw error;
  }

  return data;
}

export async function adminUserHasVerifiedTotp(admin: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const data = await adminListMfaFactors(admin, userId);
    return hasVerifiedTotpFactor(data);
  } catch {
    return false;
  }
}

export async function adminDeleteVerifiedTotpFactors(
  admin: SupabaseClient,
  userId: string,
): Promise<number> {
  const data = await adminListMfaFactors(admin, userId);
  const factors = verifiedTotpFactors(data);

  for (const factor of factors) {
    if (!factor.id) {
      continue;
    }

    const { error } = await admin.auth.admin.mfa.deleteFactor({
      id: factor.id,
      userId,
    });
    if (error) {
      throw error;
    }
  }

  return factors.length;
}
