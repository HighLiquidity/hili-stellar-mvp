'use server';

import { requireAdminFromAccessToken } from '@/lib/users/require-admin';
import { requireOperatorOrAdminFromAccessToken } from '@/lib/users/require-panel-role';
import { canSubmitOwnWhitelistRequests } from '@/lib/users/roles';
import {
  assertWhitelistRowInApproverScope,
  loadWhitelistRowClientId,
  requireWhitelistApproverFromAccessToken,
  resolveWhitelistClientFilter,
} from '@/lib/users/require-whitelist-approver';
import {
  normalizePixWhitelistBeneficiaryName,
  normalizePixWhitelistKey,
  PixWhitelistValidationError,
} from '@/lib/pix-whitelist/normalize';
import { listActivePixWhitelist, listActivePixWhitelistForUser } from '@/lib/pix-whitelist/store';
import type { PixWhitelistRow } from '@/lib/pix-whitelist/types';

const PIX_WHITELIST_TABLE = 'user_pix_whitelist';
const PIX_WHITELIST_COLUMNS =
  'id, user_id, pix_key, beneficiary_name, label, is_active, approval_status, reviewed_at, reviewed_by_email, rejection_reason, created_at, updated_at, created_by_email';

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
      admin
        .from(PIX_WHITELIST_TABLE)
        .select(PIX_WHITELIST_COLUMNS)
        .eq('approval_status', 'approved')
        .order('created_at', { ascending: false })
        .limit(200),
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

    const now = new Date().toISOString();
    const payload = {
      user_id: authUserId,
      pix_key: pixKey,
      beneficiary_name: beneficiaryName,
      label: input.label?.trim() || null,
      is_active: input.isActive,
      approval_status: 'approved' as const,
      reviewed_at: now,
      reviewed_by_email: actorEmail,
      rejection_reason: null,
      updated_at: now,
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

export async function listMyPixWhitelistAction(
  accessToken: string,
): Promise<ActionResult<PixWhitelistRow[]>> {
  try {
    const { admin, userId } = await requireOperatorOrAdminFromAccessToken(accessToken);
    const { data, error } = await admin
      .from(PIX_WHITELIST_TABLE)
      .select(PIX_WHITELIST_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) return { ok: false, message: error.message };
    return { ok: true, data: (data ?? []) as PixWhitelistRow[] };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function listPendingPixWhitelistAction(
  accessToken: string,
): Promise<ActionResult<PixWhitelistRowWithEmail[]>> {
  try {
    const ctx = await requireWhitelistApproverFromAccessToken(accessToken);
    const clientFilter = resolveWhitelistClientFilter(ctx);

    let query = ctx.admin
      .from(PIX_WHITELIST_TABLE)
      .select(PIX_WHITELIST_COLUMNS)
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: false })
      .limit(200);

    if (clientFilter) {
      query = query.eq('client_id', clientFilter);
    }

    const [{ data, error }, userIdEmailMap] = await Promise.all([
      query,
      listAuthUsersByEmail(ctx.admin),
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

export async function submitPixWhitelistRequestAction(
  accessToken: string,
  input: {
    pixKey: string;
    beneficiaryName?: string | null;
    label?: string | null;
  },
): Promise<ActionResult<{ id: string }>> {
  try {
    const { admin, userId, email: actorEmail, role, clientId } = await requireOperatorOrAdminFromAccessToken(accessToken);
    if (!canSubmitOwnWhitelistRequests(role)) {
      return { ok: false, message: 'Only operators and client admins can submit whitelist requests.' };
    }

    if (!clientId) {
      return { ok: false, message: 'Operator is not linked to a client.' };
    }

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
    const now = new Date().toISOString();

    const { data: existing, error: existingError } = await admin
      .from(PIX_WHITELIST_TABLE)
      .select('id, approval_status, is_active')
      .eq('user_id', userId)
      .eq('pix_key', pixKey)
      .maybeSingle();

    if (existingError) return { ok: false, message: existingError.message };

    if (existing?.approval_status === 'approved' && existing.is_active) {
      return { ok: false, message: 'PIX key already whitelisted.' };
    }
    if (existing?.approval_status === 'pending') {
      return { ok: false, message: 'PIX key request already pending approval.' };
    }

    const payload = {
      user_id: userId,
      client_id: clientId,
      pix_key: pixKey,
      beneficiary_name: beneficiaryName,
      label: input.label?.trim() || null,
      is_active: false,
      approval_status: 'pending' as const,
      reviewed_at: null,
      reviewed_by_email: null,
      rejection_reason: null,
      updated_at: now,
      created_by_email: actorEmail,
    };

    if (existing?.id) {
      const { error } = await admin.from(PIX_WHITELIST_TABLE).update(payload).eq('id', existing.id);
      if (error) return { ok: false, message: error.message };
      return { ok: true, data: { id: existing.id } };
    }

    const { data, error } = await admin
      .from(PIX_WHITELIST_TABLE)
      .insert(payload)
      .select('id')
      .maybeSingle();

    if (error) return { ok: false, message: error.message };
    if (!data?.id) return { ok: false, message: 'Failed to create whitelist request.' };
    return { ok: true, data: { id: data.id } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function cancelPixWhitelistRequestAction(
  accessToken: string,
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { admin, userId } = await requireOperatorOrAdminFromAccessToken(accessToken);
    const targetId = id.trim();
    if (!targetId) {
      return { ok: false, message: 'ID inválido.' };
    }

    const { data: row, error: fetchError } = await admin
      .from(PIX_WHITELIST_TABLE)
      .select('id, user_id, approval_status')
      .eq('id', targetId)
      .maybeSingle();

    if (fetchError) return { ok: false, message: fetchError.message };
    if (!row || row.user_id !== userId) {
      return { ok: false, message: 'Request not found.' };
    }
    if (row.approval_status !== 'pending') {
      return { ok: false, message: 'Only pending requests can be cancelled.' };
    }

    const { error } = await admin.from(PIX_WHITELIST_TABLE).delete().eq('id', targetId);
    if (error) return { ok: false, message: error.message };
    return { ok: true, data: { id: targetId } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function approvePixWhitelistRequestAction(
  accessToken: string,
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireWhitelistApproverFromAccessToken(accessToken);
    const row = await loadWhitelistRowClientId(ctx.admin, PIX_WHITELIST_TABLE, id);
    assertWhitelistRowInApproverScope(ctx, row.client_id);

    if (row.approval_status !== 'pending') {
      return { ok: false, message: 'Request is not pending.' };
    }

    const now = new Date().toISOString();
    const { error } = await ctx.admin
      .from(PIX_WHITELIST_TABLE)
      .update({
        is_active: true,
        approval_status: 'approved',
        reviewed_at: now,
        reviewed_by_email: ctx.email,
        rejection_reason: null,
        updated_at: now,
      })
      .eq('id', row.id);

    if (error) return { ok: false, message: error.message };
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function rejectPixWhitelistRequestAction(
  accessToken: string,
  input: { id: string; reason?: string | null },
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireWhitelistApproverFromAccessToken(accessToken);
    const row = await loadWhitelistRowClientId(ctx.admin, PIX_WHITELIST_TABLE, input.id);
    assertWhitelistRowInApproverScope(ctx, row.client_id);

    if (row.approval_status !== 'pending') {
      return { ok: false, message: 'Request is not pending.' };
    }

    const now = new Date().toISOString();
    const { error } = await ctx.admin
      .from(PIX_WHITELIST_TABLE)
      .update({
        is_active: false,
        approval_status: 'rejected',
        reviewed_at: now,
        reviewed_by_email: ctx.email,
        rejection_reason: input.reason?.trim() || null,
        updated_at: now,
      })
      .eq('id', row.id);

    if (error) return { ok: false, message: error.message };
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
