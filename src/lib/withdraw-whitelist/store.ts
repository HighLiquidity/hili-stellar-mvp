import '@/lib/server/only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

import { normalizeWithdrawWhitelistAddress } from './onramp-network';

import type { WithdrawWhitelistInsert, WithdrawWhitelistNetwork, WithdrawWhitelistRow } from './types';

const TABLE = 'user_withdraw_whitelist';

export async function listUserWithdrawWhitelist(userId: string): Promise<WithdrawWhitelistRow[]> {
  const admin = createSupabaseAdmin();
  if (!admin) return [];

  const { data, error } = await admin
    .from(TABLE)
    .select('id, user_id, address, network, label, is_active, created_at, updated_at, created_by_email')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[withdraw-whitelist] list failed', { userId, error: error.message });
    return [];
  }

  return (data ?? []) as WithdrawWhitelistRow[];
}

export async function upsertWithdrawWhitelistEntry(input: WithdrawWhitelistInsert): Promise<void> {
  const admin = createSupabaseAdmin();
  if (!admin) return;

  const now = new Date().toISOString();
  const { userId, address, network, label, isActive, createdByEmail } = input;

  const { error } = await admin
    .from(TABLE)
    .upsert(
      {
        user_id: userId,
        address: normalizeWithdrawWhitelistAddress(address),
        network,
        label: label?.trim() || null,
        is_active: isActive ?? true,
        created_by_email: createdByEmail ?? null,
        updated_at: now,
      },
      {
        onConflict: 'user_id,address,network',
      },
    );

  if (error) {
    console.error('[withdraw-whitelist] upsert failed', {
      userId,
      address,
      network,
      error: error.message,
    });
  }
}

export async function setWithdrawWhitelistActive(
  id: string,
  isActive: boolean,
): Promise<void> {
  const admin = createSupabaseAdmin();
  if (!admin) return;

  const { error } = await admin
    .from(TABLE)
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('[withdraw-whitelist] update is_active failed', {
      id,
      isActive,
      error: error.message,
    });
  }
}

export async function isWithdrawAddressWhitelistedForUser(params: {
  userId: string;
  address: string;
  network: WithdrawWhitelistNetwork;
}): Promise<boolean> {
  const admin = createSupabaseAdmin();
  if (!admin) return false;

  const { userId, address, network } = params;
  const normalizedAddress = normalizeWithdrawWhitelistAddress(address);

  const { data, error } = await admin
    .from(TABLE)
    .select('id')
    .eq('user_id', userId)
    .eq('address', normalizedAddress)
    .eq('network', network)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[withdraw-whitelist] check failed', {
      userId,
      address: normalizedAddress,
      network,
      error: error.message,
    });
    return false;
  }

  return Boolean(data);
}

/** On-ramp admin flow: any active whitelist entry on the configured network is valid. */
export async function isWithdrawAddressWhitelistedOnNetwork(params: {
  address: string;
  network: WithdrawWhitelistNetwork;
}): Promise<boolean> {
  const admin = createSupabaseAdmin();
  if (!admin) return false;

  const normalizedAddress = normalizeWithdrawWhitelistAddress(params.address);

  const { data, error } = await admin
    .from(TABLE)
    .select('id')
    .eq('address', normalizedAddress)
    .eq('network', params.network)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[withdraw-whitelist] network check failed', {
      address: normalizedAddress,
      network: params.network,
      error: error.message,
    });
    return false;
  }

  return Boolean(data);
}

export async function listActiveWithdrawWhitelistOnNetwork(
  network: WithdrawWhitelistNetwork,
): Promise<WithdrawWhitelistRow[]> {
  const admin = createSupabaseAdmin();
  if (!admin) return [];

  const { data, error } = await admin
    .from(TABLE)
    .select('id, user_id, address, network, label, is_active, created_at, updated_at, created_by_email')
    .eq('is_active', true)
    .eq('network', network)
    .order('label', { ascending: true })
    .order('address', { ascending: true });

  if (error) {
    console.error('[withdraw-whitelist] list by network failed', { network, error: error.message });
    return [];
  }

  return (data ?? []) as WithdrawWhitelistRow[];
}
