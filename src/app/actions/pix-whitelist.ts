'use server';

import { requireAdminFromAccessToken } from '@/lib/users/require-admin';
import { requireOperatorOrAdminFromAccessToken } from '@/lib/users/require-panel-role';
import {
  normalizePixWhitelistBeneficiaryName,
  normalizePixWhitelistKey,
  PixWhitelistValidationError,
} from '@/lib/pix-whitelist/normalize';
import { listActivePixWhitelist, listActivePixWhitelistForUser } from '@/lib/pix-whitelist/store';
import type { PixWhitelistRow } from '@/lib/pix-whitelist/types';

const PIX_WHITELIST_TABLE = 'user_pix_whitelist';
const PIX_WHITELIST_COLUMNS =
  'id, user_id, pix_key, beneficiary_name, label, is_active, created_at, updated_at, created_by_email';

type PixWhitelistRowWithEmail = PixWhitelistRow & {
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

export async function listPixWhitelistAction(
  accessToken: string,
): Promise<ActionResult<PixWhitelistRowWithEmail[]>> {
  try {
    const { admin } = await requireAdminFromAccessToken(accessToken);

    const [{ data, error }, userIdEmailMap] = await Promise.all([
      admin.from(PIX_WHITELIST_TABLE).select(PIX_WHITELIST_COLUMNS).order('created_at', { ascending: false }).limit(200),
      listAuthUsersByEmail(admin),
    ]);

    if (error) return { ok: false, message: error.message };

    const rows = ((data ?? []) as PixWhitelistRow[]).map((row) => ({
      ...row,
      user_email: userIdEmailMap.get(row.user_id) ?? null,
    }));

    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function listOfframpPixWhitelistAction(
  accessToken: string,
): Promise<ActionResult<PixWhitelistRow[]>> {
  try {
    const { userId, role } = await requireOperatorOrAdminFromAccessToken(accessToken);
    const rows =
      role === 'admin' ? await listActivePixWhitelist() : await listActivePixWhitelistForUser(userId);
    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function upsertPixWhitelistAction(
  accessToken: string,
  input: {
    id?: string;
    userEmail: string;
    pixKey: string;
    beneficiaryName?: string | null;
    label?: string | null;
    isActive: boolean;
  },
): Promise<ActionResult<{ id?: string }>> {
  try {
    const { admin, email: actorEmail } = await requireAdminFromAccessToken(accessToken);
    const userEmail = normalizeEmail(input.userEmail);

    let pixKey: string;
    try {
      pixKey = normalizePixWhitelistKey(input.pixKey);
    } catch (error) {
      return {
        ok: false,
        message: error instanceof PixWhitelistValidationError ? error.message : 'Chave PIX inválida.',
      };
    }

    const beneficiaryName = normalizePixWhitelistBeneficiaryName(input.beneficiaryName);

    if (!userEmail || !userEmail.includes('@')) {
      return { ok: false, message: 'E-mail inválido.' };
    }

    const authUserId = await findAuthUserIdByEmail(admin, userEmail);
    if (!authUserId) {
      return { ok: false, message: 'User not found in panel access list.' };
    }

    const payload = {
      user_id: authUserId,
      pix_key: pixKey,
      beneficiary_name: beneficiaryName,
      label: input.label?.trim() || null,
      is_active: input.isActive,
      updated_at: new Date().toISOString(),
    };

    if (input.id) {
      const { error } = await admin.from(PIX_WHITELIST_TABLE).update(payload).eq('id', input.id);
      if (error) return { ok: false, message: error.message };
      return { ok: true, data: { id: input.id } };
    }

    const { data, error } = await admin
      .from(PIX_WHITELIST_TABLE)
      .upsert(
        {
          ...payload,
          created_by_email: actorEmail,
        },
        { onConflict: 'user_id,pix_key' },
      )
      .select('id')
      .maybeSingle();

    if (error) return { ok: false, message: error.message };
    return { ok: true, data: { id: data?.id } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function deletePixWhitelistAction(
  accessToken: string,
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { admin } = await requireAdminFromAccessToken(accessToken);
    const targetId = id.trim();
    if (!targetId) {
      return { ok: false, message: 'ID inválido.' };
    }

    const { error } = await admin.from(PIX_WHITELIST_TABLE).delete().eq('id', targetId);
    if (error) return { ok: false, message: error.message };
    return { ok: true, data: { id: targetId } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
