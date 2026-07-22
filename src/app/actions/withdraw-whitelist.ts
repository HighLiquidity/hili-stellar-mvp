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
  getOnrampWithdrawNetwork,
  normalizeWithdrawWhitelistAddress,
  shouldOfferWithdrawWhitelistMemo,
  WithdrawWhitelistAddressError,
} from '@/lib/withdraw-whitelist/onramp-network';
import { normalizeWithdrawWhitelistMemo } from '@/lib/withdraw-whitelist/memo';
import { listActiveWithdrawWhitelistOnNetwork } from '@/lib/withdraw-whitelist/store';
import {
  cancelWithdrawWhitelistRequest,
  submitWithdrawWhitelistRequest,
} from '@/lib/withdraw-whitelist/submit-request';
import type { WithdrawWhitelistNetwork, WithdrawWhitelistRow } from '@/lib/withdraw-whitelist/types';

const WHITELIST_TABLE = 'user_withdraw_whitelist';
const PANEL_ACCESS_TABLE = 'panel_access_list';
const WHITELIST_COLUMNS =
  'id, user_id, address, network, label, memo, is_active, approval_status, reviewed_at, reviewed_by_email, rejection_reason, created_at, updated_at, created_by_email';

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
      admin
        .from(WHITELIST_TABLE)
        .select(WHITELIST_COLUMNS)
        .eq('approval_status', 'approved')
        .order('created_at', { ascending: false })
        .limit(200),
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

export async function getOnrampWithdrawNetworkAction(
  accessToken: string,
): Promise<ActionResult<{ network: WithdrawWhitelistNetwork }>> {
  try {
    await requireOperatorOrAdminFromAccessToken(accessToken);
    return { ok: true, data: { network: getOnrampWithdrawNetwork() } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function listOnrampWithdrawWhitelistAction(
  accessToken: string,
): Promise<ActionResult<WithdrawWhitelistRow[]>> {
  try {
    const { admin, userId, role } = await requireOperatorOrAdminFromAccessToken(accessToken);
    const network = getOnrampWithdrawNetwork();

    if (role === 'admin') {
      const rows = await listActiveWithdrawWhitelistOnNetwork(network);
      return { ok: true, data: rows };
    }

    const { data, error } = await admin
      .from(WHITELIST_TABLE)
      .select(WHITELIST_COLUMNS)
      .eq('user_id', userId)
      .eq('network', network)
      .eq('is_active', true)
      .order('label', { ascending: true })
      .order('address', { ascending: true });

    if (error) return { ok: false, message: error.message };

    const rows = (data ?? []) as WithdrawWhitelistRow[];
    if (rows.length > 0) {
      return { ok: true, data: rows };
    }

    const { data: otherNetworkRows, error: otherNetworkError } = await admin
      .from(WHITELIST_TABLE)
      .select('network')
      .eq('user_id', userId)
      .eq('is_active', true)
      .neq('network', network)
      .limit(5);

    if (otherNetworkError) return { ok: false, message: otherNetworkError.message };

    const otherNetworks = Array.from(
      new Set((otherNetworkRows ?? []).map((row) => row.network).filter(Boolean)),
    );

    if (otherNetworks.length > 0) {
      return {
        ok: false,
        message: `Wallet cadastrada em ${otherNetworks.join(', ')}, mas o on-ramp está configurado para ${network}. Edite a wallet no admin (coluna rede) ou ajuste ONRAMP_WITHDRAW_NETWORK no Vercel e faça redeploy.`,
      };
    }

    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function listMyActiveWithdrawWhitelistAction(
  accessToken: string,
): Promise<ActionResult<WithdrawWhitelistRow[]>> {
  try {
    const { admin, userId } = await requireOperatorOrAdminFromAccessToken(accessToken);
    const { data, error } = await admin
      .from(WHITELIST_TABLE)
      .select(WHITELIST_COLUMNS)
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('label', { ascending: true })
      .order('address', { ascending: true });

    if (error) return { ok: false, message: error.message };
    return { ok: true, data: (data ?? []) as WithdrawWhitelistRow[] };
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
    label?: string | null;
    memo?: string | null;
    isActive: boolean;
  },
): Promise<ActionResult<{ id?: string }>> {
  try {
    const { admin, email: actorEmail } = await requireAdminFromAccessToken(accessToken);
    const userEmail = normalizeEmail(input.userEmail);
    let address: string;
    try {
      address = normalizeWithdrawWhitelistAddress(input.address);
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof WithdrawWhitelistAddressError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'Endereço inválido.',
      };
    }
    let memo: string | null;
    try {
      memo = shouldOfferWithdrawWhitelistMemo(address)
        ? normalizeWithdrawWhitelistMemo(input.memo)
        : null;
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Memo inválido.',
      };
    }

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

    const network = getOnrampWithdrawNetwork();

    const now = new Date().toISOString();
    const payload = {
      user_id: authUserId,
      address,
      network,
      label: input.label?.trim() || null,
      memo,
      is_active: input.isActive,
      approval_status: 'approved' as const,
      reviewed_at: now,
      reviewed_by_email: actorEmail,
      rejection_reason: null,
      updated_at: now,
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

export async function deleteWithdrawWhitelistAction(
  accessToken: string,
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { admin } = await requireAdminFromAccessToken(accessToken);
    const targetId = id.trim();
    if (!targetId) {
      return { ok: false, message: 'ID inválido.' };
    }

    const { error } = await admin.from(WHITELIST_TABLE).delete().eq('id', targetId);
    if (error) return { ok: false, message: error.message };
    return { ok: true, data: { id: targetId } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function listMyWithdrawWhitelistAction(
  accessToken: string,
): Promise<ActionResult<WithdrawWhitelistRow[]>> {
  try {
    const { admin, userId } = await requireOperatorOrAdminFromAccessToken(accessToken);
    const { data, error } = await admin
      .from(WHITELIST_TABLE)
      .select(WHITELIST_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) return { ok: false, message: error.message };
    return { ok: true, data: (data ?? []) as WithdrawWhitelistRow[] };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function listPendingWithdrawWhitelistAction(
  accessToken: string,
): Promise<ActionResult<WithdrawWhitelistRowWithEmail[]>> {
  try {
    const ctx = await requireWhitelistApproverFromAccessToken(accessToken);
    const clientFilter = resolveWhitelistClientFilter(ctx);

    let query = ctx.admin
      .from(WHITELIST_TABLE)
      .select(WHITELIST_COLUMNS)
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

    const rows = ((data ?? []) as WithdrawWhitelistRow[]).map((row) => ({
      ...row,
      user_email: userIdEmailMap.get(row.user_id) ?? null,
    }));

    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function submitWithdrawWhitelistRequestAction(
  accessToken: string,
  input: {
    address: string;
    label?: string | null;
    memo?: string | null;
  },
): Promise<ActionResult<{ id: string }>> {
  try {
    const { userId, email: actorEmail, role, clientId } = await requireOperatorOrAdminFromAccessToken(accessToken);
    if (!canSubmitOwnWhitelistRequests(role)) {
      return { ok: false, message: 'Only operators and client admins can submit whitelist requests.' };
    }

    if (!clientId) {
      return { ok: false, message: 'Operator is not linked to a client.' };
    }

    const row = await submitWithdrawWhitelistRequest(
      { userId, clientId, email: actorEmail },
      input,
    );
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function cancelWithdrawWhitelistRequestAction(
  accessToken: string,
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { userId } = await requireOperatorOrAdminFromAccessToken(accessToken);
    const result = await cancelWithdrawWhitelistRequest(userId, id);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function approveWithdrawWhitelistRequestAction(
  accessToken: string,
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireWhitelistApproverFromAccessToken(accessToken);
    const row = await loadWhitelistRowClientId(ctx.admin, WHITELIST_TABLE, id);
    assertWhitelistRowInApproverScope(ctx, row.client_id);

    if (row.approval_status !== 'pending') {
      return { ok: false, message: 'Request is not pending.' };
    }

    const now = new Date().toISOString();
    const { error } = await ctx.admin
      .from(WHITELIST_TABLE)
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

export async function rejectWithdrawWhitelistRequestAction(
  accessToken: string,
  input: { id: string; reason?: string | null },
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireWhitelistApproverFromAccessToken(accessToken);
    const row = await loadWhitelistRowClientId(ctx.admin, WHITELIST_TABLE, input.id);
    assertWhitelistRowInApproverScope(ctx, row.client_id);

    if (row.approval_status !== 'pending') {
      return { ok: false, message: 'Request is not pending.' };
    }

    const now = new Date().toISOString();
    const { error } = await ctx.admin
      .from(WHITELIST_TABLE)
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

