import { createSupabaseAdmin } from '@/lib/supabase/admin';

import type { RampOnrampStatus, RampOperationType } from './types';

export const RAMP_OPERATIONS_TABLE = 'ramp_operations';

export type RampOperationRow = {
  id: string;
  ramp_operation_id: string | null;
  operation_type: RampOperationType;
  external_id: string;
  status: string;
  version: number;
  amount: string | null;
  destination: string | null;
  memo: string | null;
  tx_hash: string | null;
  failure_reason: string | null;
  corpx_event_type: string | null;
  corpx_provider_tx_id: string | null;
  corpx_dedupe_key: string | null;
  callback_last_version: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export async function findRampOperationByExternalId(
  externalId: string,
): Promise<RampOperationRow | null> {
  const admin = createSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin
    .from(RAMP_OPERATIONS_TABLE)
    .select('*')
    .eq('external_id', externalId)
    .maybeSingle();

  if (error) {
    console.error('[ramp/store] find by external_id failed', error.message);
    return null;
  }

  return (data as RampOperationRow | null) ?? null;
}

export async function findRampOperationByRampOperationId(
  rampOperationId: string,
): Promise<RampOperationRow | null> {
  const admin = createSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin
    .from(RAMP_OPERATIONS_TABLE)
    .select('*')
    .eq('ramp_operation_id', rampOperationId)
    .maybeSingle();

  if (error) {
    console.error('[ramp/store] find by ramp_operation_id failed', error.message);
    return null;
  }

  return (data as RampOperationRow | null) ?? null;
}

export async function insertRampOperationPending(input: {
  externalId: string;
  operationType: RampOperationType;
  status: string;
  amount: string;
  destination?: string | null;
  memo?: string | null;
  corpxEventType?: string;
  corpxProviderTxId?: string;
  corpxDedupeKey?: string;
}): Promise<{ ok: true; row: RampOperationRow } | { ok: false; reason: string }> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    return { ok: false, reason: 'SUPABASE_SERVICE_ROLE_KEY missing' };
  }

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from(RAMP_OPERATIONS_TABLE)
    .insert({
      operation_type: input.operationType,
      external_id: input.externalId,
      status: input.status,
      amount: input.amount,
      destination: input.destination ?? null,
      memo: input.memo ?? null,
      corpx_event_type: input.corpxEventType ?? null,
      corpx_provider_tx_id: input.corpxProviderTxId ?? null,
      corpx_dedupe_key: input.corpxDedupeKey ?? null,
      updated_at: now,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      const existing = await findRampOperationByExternalId(input.externalId);
      if (existing) return { ok: true, row: existing };
    }
    return { ok: false, reason: error.message };
  }

  return { ok: true, row: data as RampOperationRow };
}

export async function updateRampOperationFailed(input: {
  externalId: string;
  status: string;
  failureReason: string;
}): Promise<void> {
  const admin = createSupabaseAdmin();
  if (!admin) return;

  const { error } = await admin
    .from(RAMP_OPERATIONS_TABLE)
    .update({
      status: input.status,
      failure_reason: input.failureReason,
      updated_at: new Date().toISOString(),
    })
    .eq('external_id', input.externalId);

  if (error) {
    console.error('[ramp/store] update failed status', error.message);
  }
}

export async function updateRampOperationAfterCreate(input: {
  externalId: string;
  rampOperationId: string;
  status: string;
  failureReason?: string | null;
}): Promise<void> {
  const admin = createSupabaseAdmin();
  if (!admin) return;

  const { error } = await admin
    .from(RAMP_OPERATIONS_TABLE)
    .update({
      ramp_operation_id: input.rampOperationId,
      status: input.status,
      failure_reason: input.failureReason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('external_id', input.externalId);

  if (error) {
    console.error('[ramp/store] update after create failed', error.message);
  }
}

export async function markRampOperationSkipped(input: {
  externalId: string;
  operationType: RampOperationType;
  amount: string;
  reason: string;
  corpxEventType?: string;
  corpxProviderTxId?: string;
  corpxDedupeKey?: string;
}): Promise<void> {
  const admin = createSupabaseAdmin();
  if (!admin) return;

  const existing = await findRampOperationByExternalId(input.externalId);
  if (existing) return;

  await admin.from(RAMP_OPERATIONS_TABLE).insert({
    operation_type: input.operationType,
    external_id: input.externalId,
    status: 'skipped',
    amount: input.amount,
    failure_reason: input.reason,
    corpx_event_type: input.corpxEventType ?? null,
    corpx_provider_tx_id: input.corpxProviderTxId ?? null,
    corpx_dedupe_key: input.corpxDedupeKey ?? null,
    updated_at: new Date().toISOString(),
  });
}

export async function applyRampCallbackUpdate(input: {
  rampOperationId: string;
  status: string;
  version: number;
  txHash?: string | null;
  destination?: string | null;
  amount?: string | null;
  failureReason?: string | null;
  callbackData?: Record<string, unknown>;
}): Promise<{ applied: boolean; reason?: string }> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    return { applied: false, reason: 'no admin client' };
  }

  const { data: row, error: readError } = await admin
    .from(RAMP_OPERATIONS_TABLE)
    .select('id, callback_last_version, version, status')
    .eq('ramp_operation_id', input.rampOperationId)
    .maybeSingle();

  if (readError || !row) {
    return { applied: false, reason: readError?.message ?? 'operation not found locally' };
  }

  const lastCallbackVersion = Number(row.callback_last_version ?? 0);
  if (input.version <= lastCallbackVersion) {
    return { applied: false, reason: 'stale callback version' };
  }

  const reasonFromData =
    input.failureReason ??
    (typeof input.callbackData?.reason === 'string' ? input.callbackData.reason : null);

  const patch: Record<string, unknown> = {
    status: input.status,
    version: Math.max(Number(row.version ?? 0), input.version),
    callback_last_version: input.version,
    failure_reason: reasonFromData,
    metadata: input.callbackData ?? {},
    updated_at: new Date().toISOString(),
  };
  if (input.txHash != null) patch.tx_hash = input.txHash;
  if (input.destination != null) patch.destination = input.destination;
  if (input.amount != null) patch.amount = input.amount;

  const { error: updateError } = await admin.from(RAMP_OPERATIONS_TABLE).update(patch).eq('id', row.id);

  if (updateError) {
    console.error('[ramp/store] callback update failed', updateError.message);
    return { applied: false, reason: updateError.message };
  }

  return { applied: true };
}

export function isTerminalOnrampStatus(status: string): boolean {
  return (
    status === 'confirmed' ||
    status === 'failed' ||
    status === 'needs_review' ||
    status === 'callback_failed'
  );
}

export type { RampOnrampStatus };
