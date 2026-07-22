import '@/lib/server/only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { WhitelistApprovalStatus } from '@/lib/whitelist/approval';
import { WhitelistRequestError, type WhitelistSubmitActor } from '@/lib/whitelist/request-errors';
import {
  normalizePixWhitelistBeneficiaryName,
  normalizePixWhitelistKey,
  PixWhitelistValidationError,
} from './normalize';
import type { PixWhitelistRow } from './types';

const TABLE = 'user_pix_whitelist';
const SELECT_COLUMNS =
  'id, user_id, pix_key, beneficiary_name, label, is_active, approval_status, reviewed_at, reviewed_by_email, rejection_reason, created_at, updated_at, created_by_email';

function requireAdmin() {
  const admin = createSupabaseAdmin();
  if (!admin) {
    throw new WhitelistRequestError('Supabase admin is not configured.', 503);
  }
  return admin;
}

export async function submitPixWhitelistRequest(
  actor: WhitelistSubmitActor,
  input: {
    pixKey: string;
    beneficiaryName?: string | null;
    label?: string | null;
  },
): Promise<PixWhitelistRow> {
  if (!actor.clientId.trim()) {
    throw new WhitelistRequestError('Operator is not linked to a client.', 403);
  }

  let pixKey: string;
  try {
    pixKey = normalizePixWhitelistKey(input.pixKey);
  } catch (error) {
    throw new WhitelistRequestError(
      error instanceof PixWhitelistValidationError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Invalid PIX key.',
      400,
    );
  }

  const beneficiaryName = normalizePixWhitelistBeneficiaryName(input.beneficiaryName);
  const admin = requireAdmin();
  const now = new Date().toISOString();

  const { data: existing, error: existingError } = await admin
    .from(TABLE)
    .select('id, approval_status, is_active')
    .eq('user_id', actor.userId)
    .eq('pix_key', pixKey)
    .maybeSingle();

  if (existingError) {
    throw new WhitelistRequestError(existingError.message, 500);
  }

  if (existing?.approval_status === 'approved' && existing.is_active) {
    throw new WhitelistRequestError('PIX key already whitelisted.', 409);
  }
  if (existing?.approval_status === 'pending') {
    throw new WhitelistRequestError('PIX key request already pending approval.', 409);
  }

  const payload = {
    user_id: actor.userId,
    client_id: actor.clientId,
    pix_key: pixKey,
    beneficiary_name: beneficiaryName,
    label: input.label?.trim() || null,
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
    return data as PixWhitelistRow;
  }

  const { data, error } = await admin
    .from(TABLE)
    .insert(payload)
    .select(SELECT_COLUMNS)
    .maybeSingle();

  if (error) throw new WhitelistRequestError(error.message, 500);
  if (!data) throw new WhitelistRequestError('Failed to create whitelist request.', 500);
  return data as PixWhitelistRow;
}

export async function cancelPixWhitelistRequest(
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

export async function listPixWhitelistForUser(params: {
  userId: string;
  status?: WhitelistApprovalStatus | null;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: PixWhitelistRow[]; total: number; page: number; pageSize: number }> {
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
    rows: (data ?? []) as PixWhitelistRow[],
    total: count ?? 0,
    page,
    pageSize,
  };
}
