import '@/lib/server/only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

import { normalizePixWhitelistBeneficiaryName, normalizePixWhitelistKey } from './normalize';
import type { PixWhitelistInsert, PixWhitelistRow } from './types';

const TABLE = 'user_pix_whitelist';

export const PIX_WHITELIST_SELECT =
  'id, user_id, pix_key, beneficiary_name, label, is_active, approval_status, reviewed_at, reviewed_by_email, rejection_reason, created_at, updated_at, created_by_email';

export async function upsertPixWhitelistEntry(input: PixWhitelistInsert): Promise<void> {
  const admin = createSupabaseAdmin();
  if (!admin) return;

  const now = new Date().toISOString();
  const pixKey = normalizePixWhitelistKey(input.pixKey);

  const { error } = await admin.from(TABLE).upsert(
    {
      user_id: input.userId,
      pix_key: pixKey,
      beneficiary_name: normalizePixWhitelistBeneficiaryName(input.beneficiaryName),
      label: input.label?.trim() || null,
      is_active: input.isActive ?? true,
      created_by_email: input.createdByEmail ?? null,
      updated_at: now,
    },
    {
      onConflict: 'user_id,pix_key',
    },
  );

  if (error) {
    console.error('[pix-whitelist] upsert failed', {
      userId: input.userId,
      pixKey,
      error: error.message,
    });
  }
}

/** Off-ramp flow: any active whitelist entry is valid (same model as Stellar wallets). */
export async function findActivePixWhitelistEntry(params: {
  pixKey: string;
}): Promise<PixWhitelistRow | null> {
  const admin = createSupabaseAdmin();
  if (!admin) return null;

  const normalizedKey = normalizePixWhitelistKey(params.pixKey);

  const { data, error } = await admin
    .from(TABLE)
    .select(PIX_WHITELIST_SELECT)
    .eq('pix_key', normalizedKey)
    .eq('is_active', true)
    .eq('approval_status', 'approved')
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[pix-whitelist] lookup failed', {
      pixKey: normalizedKey,
      error: error.message,
    });
    return null;
  }

  return (data as PixWhitelistRow | null) ?? null;
}

export async function findActivePixWhitelistEntryForUser(params: {
  userId: string;
  pixKey: string;
}): Promise<PixWhitelistRow | null> {
  const admin = createSupabaseAdmin();
  if (!admin) return null;

  const normalizedKey = normalizePixWhitelistKey(params.pixKey);

  const { data, error } = await admin
    .from(TABLE)
    .select(PIX_WHITELIST_SELECT)
    .eq('user_id', params.userId)
    .eq('pix_key', normalizedKey)
    .eq('is_active', true)
    .eq('approval_status', 'approved')
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[pix-whitelist] user lookup failed', {
      userId: params.userId,
      pixKey: normalizedKey,
      error: error.message,
    });
    return null;
  }

  return (data as PixWhitelistRow | null) ?? null;
}

export async function listActivePixWhitelistForUser(userId: string): Promise<PixWhitelistRow[]> {
  const admin = createSupabaseAdmin();
  if (!admin) return [];

  const { data, error } = await admin
    .from(TABLE)
    .select(PIX_WHITELIST_SELECT)
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('approval_status', 'approved')
    .order('label', { ascending: true })
    .order('pix_key', { ascending: true });

  if (error) {
    console.error('[pix-whitelist] list active for user failed', {
      userId,
      error: error.message,
    });
    return [];
  }

  return (data ?? []) as PixWhitelistRow[];
}

export async function listActivePixWhitelist(): Promise<PixWhitelistRow[]> {
  const admin = createSupabaseAdmin();
  if (!admin) return [];

  const { data, error } = await admin
    .from(TABLE)
    .select(PIX_WHITELIST_SELECT)
    .eq('is_active', true)
    .eq('approval_status', 'approved')
    .order('label', { ascending: true })
    .order('pix_key', { ascending: true });

  if (error) {
    console.error('[pix-whitelist] list active failed', { error: error.message });
    return [];
  }

  return (data ?? []) as PixWhitelistRow[];
}
