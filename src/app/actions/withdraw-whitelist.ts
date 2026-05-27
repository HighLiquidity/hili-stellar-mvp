'use server';

import { requireAdminFromAccessToken } from '@/lib/users/require-admin';
import type { WithdrawWhitelistNetwork, WithdrawWhitelistRow } from '@/lib/withdraw-whitelist/types';

const WHITELIST_TABLE = 'user_withdraw_whitelist';
const PANEL_ACCESS_TABLE = 'panel_access_list';
const WHITELIST_COLUMNS =
  'id, user_id, address, network, label, is_active, created_at, updated_at, created_by_email';

type UserOption = {
  email: string;
};

type WithdrawWhitelistRowWithEmail = WithdrawWhitelistRow & {
  user_email: string | null;
};

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function listAuthUsersByEmail(
  admin: Awaited<ReturnType<typeof requireAdminFromAccessToken>>['admin'],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let page = 1;
  const perPage = 200;

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message);
    }

    for (const user of data.users) {
      const email = user.email?.trim().toLowerCase();
      if (email && user.id) {
        map.set(user.id, email);
      }
    }

    if (data.users.length < perPage) break;
    page += 1;
  }

  return map;
}

async function findAuthUserIdByEmail(
  admin: Awaited<ReturnType<typeof requireAdminFromAccessToken>>['admin'],
  email: string,
): Promise<string | null> {
  let page = 1;
  const perPage = 200;

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message);
    }

    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match?.id) return match.id;

    if (data.users.length < perPage) break;
    page += 1;
  }

  return null;
}

export async function listWhitelistUsersAction(
  accessToken: string,
): Promise<ActionResult<UserOption[]>> {
  try {
    const { admin } = await requireAdminFromAccessToken(accessToken);
    const { data, error } = await admin
      .from(PANEL_ACCESS_TABLE)
      .select('email')
      .eq('is_active', true)
      .order('email', { ascending: true });

    if (error) return { ok: false, message: error.message };
    return { ok: true, data: (data ?? []) as UserOption[] };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function listWithdrawWhitelistAction(
  accessToken: string,
): Promise<ActionResult<WithdrawWhitelistRowWithEmail[]>> {
  try {
    const { admin } = await requireAdminFromAccessToken(accessToken);

    const [{ data, error }, userIdEmailMap] = await Promise.all([
      admin.from(WHITELIST_TABLE).select(WHITELIST_COLUMNS).order('created_at', { ascending: false }).limit(200),
      listAuthUsersByEmail(admin),
    ]);

    if (error) return { ok: false, message: error.message };

    const rows = ((data ?? []) as WithdrawWhitelistRow[]).map((row) => ({
      ...row,
      user_email: userIdEmailMap.get(row.user_id) ?? null,
    }));

    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function upsertWithdrawWhitelistAction(
  accessToken: string,
  input: {
    id?: string;
    userEmail: string;
    address: string;
    network: WithdrawWhitelistNetwork;
    label?: string | null;
    isActive: boolean;
  },
): Promise<ActionResult<{ id?: string }>> {
  try {
    const { admin, email: actorEmail } = await requireAdminFromAccessToken(accessToken);
    const userEmail = normalizeEmail(input.userEmail);
    const address = input.address.trim();

    if (!userEmail || !userEmail.includes('@')) {
      return { ok: false, message: 'E-mail inválido.' };
    }
    if (!address) {
      return { ok: false, message: 'Endereço é obrigatório.' };
    }

    const authUserId = await findAuthUserIdByEmail(admin, userEmail);
    if (!authUserId) {
      return { ok: false, message: 'User not found in panel access list.' };
    }

    const payload = {
      user_id: authUserId,
      address,
      network: input.network,
      label: input.label?.trim() || null,
      is_active: input.isActive,
      updated_at: new Date().toISOString(),
    };

    if (input.id) {
      const { error } = await admin.from(WHITELIST_TABLE).update(payload).eq('id', input.id);
      if (error) return { ok: false, message: error.message };
      return { ok: true, data: { id: input.id } };
    }

    const { data, error } = await admin
      .from(WHITELIST_TABLE)
      .upsert(
        {
          ...payload,
          created_by_email: actorEmail,
        },
        { onConflict: 'user_id,address,network' },
      )
      .select('id')
      .maybeSingle();

    if (error) return { ok: false, message: error.message };
    return { ok: true, data: { id: data?.id } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

