import '@/lib/server/only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

import type {
  TreasuryRunRow,
  TreasuryRunStatus,
  TreasuryRunStep,
  TreasuryRunTrigger,
  TreasuryRunKind,
} from './run-types';

export const TREASURY_RUNS_TABLE = 'treasury_runs';

const RUN_SELECT =
  'id, trigger, kind, status, dry_run, requested_amount_usdc, executed_amount_usdc, binance_usdc_free, binance_withdraw_order_id, binance_withdraw_id, binance_withdraw_network, distributor_address, distributor_address_tag, steps, error, created_by_user_id, created_by_email, created_at, updated_at, completed_at, source_onramp_order_id';

function mapSteps(raw: unknown): TreasuryRunStep[] {
  if (!Array.isArray(raw)) return [];
  return raw as TreasuryRunStep[];
}

function mapRow(row: Record<string, unknown>): TreasuryRunRow {
  return {
    id: String(row.id),
    trigger: row.trigger as TreasuryRunTrigger,
    kind: row.kind as TreasuryRunKind,
    status: row.status as TreasuryRunStatus,
    dry_run: Boolean(row.dry_run),
    requested_amount_usdc: (row.requested_amount_usdc as string | null) ?? null,
    executed_amount_usdc: (row.executed_amount_usdc as string | null) ?? null,
    binance_usdc_free: (row.binance_usdc_free as string | null) ?? null,
    binance_withdraw_order_id: (row.binance_withdraw_order_id as string | null) ?? null,
    binance_withdraw_id: (row.binance_withdraw_id as string | null) ?? null,
    binance_withdraw_network: (row.binance_withdraw_network as string | null) ?? null,
    distributor_address: (row.distributor_address as string | null) ?? null,
    distributor_address_tag: (row.distributor_address_tag as string | null) ?? null,
    steps: mapSteps(row.steps),
    error: (row.error as string | null) ?? null,
    created_by_user_id: (row.created_by_user_id as string | null) ?? null,
    created_by_email: (row.created_by_email as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    completed_at: (row.completed_at as string | null) ?? null,
    source_onramp_order_id: (row.source_onramp_order_id as string | null) ?? null,
  };
}

export async function insertTreasuryRun(input: {
  trigger: TreasuryRunTrigger;
  kind?: TreasuryRunKind;
  status: TreasuryRunStatus;
  dryRun: boolean;
  requestedAmountUsdc?: string | null;
  binanceUsdcFree?: string | null;
  binanceWithdrawOrderId?: string | null;
  distributorAddress?: string | null;
  distributorAddressTag?: string | null;
  binanceWithdrawNetwork?: string | null;
  steps?: TreasuryRunStep[];
  createdByUserId?: string | null;
  createdByEmail?: string | null;
  sourceOnrampOrderId?: string | null;
}): Promise<TreasuryRunRow> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  }

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from(TREASURY_RUNS_TABLE)
    .insert({
      trigger: input.trigger,
      kind: input.kind ?? 'binance_usdc_refill',
      status: input.status,
      dry_run: input.dryRun,
      requested_amount_usdc: input.requestedAmountUsdc ?? null,
      binance_usdc_free: input.binanceUsdcFree ?? null,
      binance_withdraw_order_id: input.binanceWithdrawOrderId ?? null,
      distributor_address: input.distributorAddress ?? null,
      distributor_address_tag: input.distributorAddressTag ?? null,
      binance_withdraw_network: input.binanceWithdrawNetwork ?? null,
      steps: input.steps ?? [],
      created_by_user_id: input.createdByUserId ?? null,
      created_by_email: input.createdByEmail ?? null,
      source_onramp_order_id: input.sourceOnrampOrderId ?? null,
      created_at: now,
      updated_at: now,
      completed_at: input.status === 'dry_run' || input.status === 'completed' ? now : null,
    })
    .select(RUN_SELECT)
    .single();

  if (error || !data) {
    const err = new Error(error?.message ?? 'Failed to insert treasury run') as Error & {
      code?: string;
    };
    err.code = error?.code;
    throw err;
  }

  return mapRow(data as Record<string, unknown>);
}

export async function updateTreasuryRun(
  runId: string,
  patch: {
    status?: TreasuryRunStatus;
    executedAmountUsdc?: string | null;
    binanceWithdrawOrderId?: string | null;
    binanceWithdrawId?: string | null;
    binanceWithdrawNetwork?: string | null;
    steps?: TreasuryRunStep[];
    error?: string | null;
    completedAt?: string | null;
    sourceOnrampOrderId?: string | null;
  },
): Promise<TreasuryRunRow> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  }

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    updated_at: now,
  };

  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.executedAmountUsdc !== undefined) payload.executed_amount_usdc = patch.executedAmountUsdc;
  if (patch.binanceWithdrawOrderId !== undefined) {
    payload.binance_withdraw_order_id = patch.binanceWithdrawOrderId;
  }
  if (patch.binanceWithdrawId !== undefined) payload.binance_withdraw_id = patch.binanceWithdrawId;
  if (patch.binanceWithdrawNetwork !== undefined) {
    payload.binance_withdraw_network = patch.binanceWithdrawNetwork;
  }
  if (patch.steps !== undefined) payload.steps = patch.steps;
  if (patch.error !== undefined) payload.error = patch.error;
  if (patch.sourceOnrampOrderId !== undefined) {
    payload.source_onramp_order_id = patch.sourceOnrampOrderId;
  }
  if (patch.completedAt !== undefined) {
    payload.completed_at = patch.completedAt;
  } else if (patch.status === 'completed' || patch.status === 'failed' || patch.status === 'dry_run') {
    payload.completed_at = now;
  }

  const { data, error } = await admin
    .from(TREASURY_RUNS_TABLE)
    .update(payload)
    .eq('id', runId)
    .select(RUN_SELECT)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to update treasury run');
  }

  return mapRow(data as Record<string, unknown>);
}

export async function findTreasuryRunById(runId: string): Promise<TreasuryRunRow | null> {
  const admin = createSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin
    .from(TREASURY_RUNS_TABLE)
    .select(RUN_SELECT)
    .eq('id', runId.trim())
    .maybeSingle();

  if (error) {
    console.error('[treasury/runs] find by id failed', error.message);
    return null;
  }

  return data ? mapRow(data as Record<string, unknown>) : null;
}

export async function listTreasuryRuns(limit = 20): Promise<TreasuryRunRow[]> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    return [];
  }

  const { data, error } = await admin
    .from(TREASURY_RUNS_TABLE)
    .select(RUN_SELECT)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));

  if (error) {
    console.error('[treasury/runs] list failed', error.message);
    return [];
  }

  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function findTreasuryRunByWithdrawOrderId(
  withdrawOrderId: string,
): Promise<TreasuryRunRow | null> {
  const admin = createSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin
    .from(TREASURY_RUNS_TABLE)
    .select(RUN_SELECT)
    .eq('binance_withdraw_order_id', withdrawOrderId.trim())
    .maybeSingle();

  if (error) {
    console.error('[treasury/runs] find by withdraw order id failed', error.message);
    return null;
  }

  return data ? mapRow(data as Record<string, unknown>) : null;
}

export async function listRecentTreasuryRunsByKind(input: {
  kind: TreasuryRunKind;
  sinceIso: string;
  limit?: number;
}): Promise<TreasuryRunRow[]> {
  const admin = createSupabaseAdmin();
  if (!admin) return [];

  const { data, error } = await admin
    .from(TREASURY_RUNS_TABLE)
    .select(RUN_SELECT)
    .eq('kind', input.kind)
    .eq('dry_run', false)
    .in('status', ['running', 'completed'])
    .gte('created_at', input.sinceIso)
    .order('created_at', { ascending: true })
    .limit(Math.min(Math.max(input.limit ?? 50, 1), 100));

  if (error) {
    console.error('[treasury/runs] list by kind failed', error.message);
    return [];
  }

  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function findTreasuryRunBySourceOnrampOrderId(
  onrampOrderId: string,
): Promise<TreasuryRunRow | null> {
  const admin = createSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin
    .from(TREASURY_RUNS_TABLE)
    .select(RUN_SELECT)
    .eq('source_onramp_order_id', onrampOrderId.trim())
    .eq('kind', 'corpx_brl_to_binance')
    .eq('dry_run', false)
    .maybeSingle();

  if (error) {
    console.error('[treasury/runs] find by source onramp order id failed', error.message);
    return null;
  }

  return data ? mapRow(data as Record<string, unknown>) : null;
}
