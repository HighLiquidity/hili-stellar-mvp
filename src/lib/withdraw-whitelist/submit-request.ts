import '@/lib/server/only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { WhitelistApprovalStatus } from '@/lib/whitelist/approval';
import { WhitelistRequestError, type WhitelistSubmitActor } from '@/lib/whitelist/request-errors';
import { normalizeWithdrawWhitelistMemo } from './memo';
import {
  getOnrampWithdrawNetwork,
  normalizeWithdrawWhitelistAddress,
  shouldOfferWithdrawWhitelistMemo,
  WithdrawWhitelistAddressError,
} from './onramp-network';
import type { WithdrawWhitelistRow } from './types';

export type { WhitelistSubmitActor };

const TABLE = 'user_withdraw_whitelist';
const SELECT_COLUMNS =
  'id, user_id, address, network, label, memo, is_active, approval_status, reviewed_at, reviewed_by_email, rejection_reason, created_at, updated_at, created_by_email';

function requireAdmin() {
  const admin = createSupabaseAdmin();
  if (!admin) {
    throw new WhitelistRequestError('Supabase admin is not configured.', 503);
  }
  return admin;
}

export async function submitWithdrawWhitelistRequest(
  actor: WhitelistSubmitActor,
  input: {
    address: string;
    label?: string | null;
    memo?: string | null;
  },
): Promise<WithdrawWhitelistRow> {
  if (!actor.clientId.trim()) {
    throw new WhitelistRequestError('Operator is not linked to a client.', 403);
  }

  let address: string;
  try {
    address = normalizeWithdrawWhitelistAddress(input.address);
  } catch (error) {
    throw new WhitelistRequestError(
      error instanceof WithdrawWhitelistAddressError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Invalid address.',
      400,
    );
  }

  if (!address) {
    throw new WhitelistRequestError('address is required.', 400);
  }

  let memo: string | null;
  try {
    memo = shouldOfferWithdrawWhitelistMemo(address)
      ? normalizeWithdrawWhitelistMemo(input.memo)
      : null;
  } catch (error) {
    throw new WhitelistRequestError(
      error instanceof Error ? error.message : 'Invalid memo.',
      400,
    );
  }

  const admin = requireAdmin();
  const network = getOnrampWithdrawNetwork();
  const now = new Date().toISOString();

  const { data: existing, error: existingError } = await admin
    .from(TABLE)
    .select('id, approval_status, is_active')
    .eq('user_id', actor.userId)
    .eq('address', address)
    .eq('network', network)
    .maybeSingle();

  if (existingError) {
    throw new WhitelistRequestError(existingError.message, 500);
  }

  if (existing?.approval_status === 'approved' && existing.is_active) {
    throw new WhitelistRequestError('Wallet already whitelisted.', 409);
  }
  if (existing?.approval_status === 'pending') {
    throw new WhitelistRequestError('Wallet request already pending approval.', 409);
  }

  const payload = {
    user_id: actor.userId,
    client_id: actor.clientId,
    address,
    network,
    label: input.label?.trim() || null,
    memo,
    is_active: false,
    approval_status: 'pending' as const,
    reviewed_at: null,
    reviewed_by_email: null,
    rejection_reason: null,
    updated_at: now,
    created_by_email: actor.email,
  };

  if (existing?.id) {
    const { data, error } = await admin
      .from(TABLE)
      .update(payload)
      .eq('id', existing.id)
      .select(SELECT_COLUMNS)
      .maybeSingle();
    if (error) throw new WhitelistRequestError(error.message, 500);
    if (!data) throw new WhitelistRequestError('Failed to update whitelist request.', 500);
    return data as WithdrawWhitelistRow;
  }

  const { data, error } = await admin
    .from(TABLE)
    .insert(payload)
    .select(SELECT_COLUMNS)
    .maybeSingle();

  if (error) throw new WhitelistRequestError(error.message, 500);
  if (!data) throw new WhitelistRequestError('Failed to create whitelist request.', 500);
  return data as WithdrawWhitelistRow;
}

export async function cancelWithdrawWhitelistRequest(
  userId: string,
  id: string,
): Promise<{ id: string }> {
  const targetId = id.trim();
  if (!targetId) {
    throw new WhitelistRequestError('id is required.', 400);
  }

  const admin = requireAdmin();
  const { data: row, error: fetchError } = await admin
    .from(TABLE)
    .select('id, user_id, approval_status')
    .eq('id', targetId)
    .maybeSingle();

  if (fetchError) throw new WhitelistRequestError(fetchError.message, 500);
  if (!row || row.user_id !== userId) {
    throw new WhitelistRequestError('Request not found.', 404);
  }
  if (row.approval_status !== 'pending') {
    throw new WhitelistRequestError('Only pending requests can be cancelled.', 409);
  }

  const { error } = await admin.from(TABLE).delete().eq('id', targetId);
  if (error) throw new WhitelistRequestError(error.message, 500);
  return { id: targetId };
}

export async function listWithdrawWhitelistForUser(params: {
  userId: string;
  status?: WhitelistApprovalStatus | null;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: WithdrawWhitelistRow[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const admin = requireAdmin();
  let query = admin
    .from(TABLE)
    .select(SELECT_COLUMNS, { count: 'exact' })
    .eq('user_id', params.userId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (params.status) {
    query = query.eq('approval_status', params.status);
  }

  const { data, error, count } = await query;
  if (error) throw new WhitelistRequestError(error.message, 500);

  return {
    rows: (data ?? []) as WithdrawWhitelistRow[],
    total: count ?? 0,
    page,
    pageSize,
  };
}
