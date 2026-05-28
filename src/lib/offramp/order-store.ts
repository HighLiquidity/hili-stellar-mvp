import '@/lib/server/only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { OfframpOrderStatus } from './contracts';
import type { OfframpFailureCode } from './failure-codes';

export const OFFRAMP_ORDERS_TABLE = 'offramp_orders';

export type OfframpOrderRow = {
  id: string;
  status: OfframpOrderStatus;
  amount_usdc: string;
  amount_brl: string;
  quote_symbol: string;
  quote_side: 'BUY' | 'SELL';
  quote_rate: string | null;
  quote_source: string | null;
  quote_spread_bps: number | null;
  quote_expires_at: string;
  quote_locked_at: string | null;
  payout_pix_key: string;
  payout_beneficiary_name: string | null;
  payout_reference: string | null;
  payout_provider_tx_id: string | null;
  payout_end_to_end_id: string | null;
  usdc_deposit_external_id: string | null;
  usdc_deposit_ramp_operation_id: string | null;
  usdc_deposit_address: string | null;
  usdc_deposit_memo: string | null;
  usdc_received_amount: string | null;
  usdc_received_tx_hash: string | null;
  brh_issue_external_id: string | null;
  brh_issue_ramp_operation_id: string | null;
  brh_redemption_external_id: string | null;
  brh_redemption_ramp_operation_id: string | null;
  binance_symbol: string | null;
  binance_side: 'BUY' | 'SELL' | null;
  binance_client_order_id: string | null;
  binance_order_id: string | null;
  binance_executed_qty: string | null;
  binance_cummulative_quote_qty: string | null;
  binance_status: string | null;
  failure_code: OfframpFailureCode | null;
  failure_reason: string | null;
  needs_review_reason: string | null;
  created_by_user_id: string | null;
  created_by_email: string | null;
  quoted_at: string;
  usdc_received_at: string | null;
  pix_sent_at: string | null;
  brh_recorded_at: string | null;
  fx_settled_at: string | null;
  complete_at: string | null;
  expired_at: string | null;
  refunded_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type UpdateOfframpOrderPatch = Partial<
  Omit<OfframpOrderRow, 'id' | 'created_at' | 'updated_at' | 'quoted_at' | 'metadata' | 'quote_side' | 'binance_side'>
> & {
  quote_side?: 'BUY' | 'SELL';
  binance_side?: 'BUY' | 'SELL' | null;
  metadata?: Record<string, unknown> | null;
};

function normalizeOptionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function buildStatusTimestampPatch(status: OfframpOrderStatus, at: string): Partial<OfframpOrderRow> {
  switch (status) {
    case 'quoted':
      return { quoted_at: at };
    case 'usdc_received':
      return { usdc_received_at: at };
    case 'pix_sent':
      return { pix_sent_at: at };
    case 'brh_recorded':
      return { brh_recorded_at: at };
    case 'fx_settled':
      return { fx_settled_at: at };
    case 'complete':
      return { complete_at: at };
    case 'expired':
      return { expired_at: at };
    case 'refunded':
      return { refunded_at: at };
    default:
      return {};
  }
}

function normalizeUpdatePatch(input: UpdateOfframpOrderPatch): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    ...input,
    updated_at: new Date().toISOString(),
  };

  if ('quote_rate' in patch) patch.quote_rate = normalizeOptionalString(input.quote_rate);
  if ('quote_source' in patch) patch.quote_source = normalizeOptionalString(input.quote_source);
  if ('payout_beneficiary_name' in patch) patch.payout_beneficiary_name = normalizeOptionalString(input.payout_beneficiary_name);
  if ('payout_reference' in patch) patch.payout_reference = normalizeOptionalString(input.payout_reference);
  if ('payout_provider_tx_id' in patch) patch.payout_provider_tx_id = normalizeOptionalString(input.payout_provider_tx_id);
  if ('payout_end_to_end_id' in patch) patch.payout_end_to_end_id = normalizeOptionalString(input.payout_end_to_end_id);
  if ('usdc_deposit_external_id' in patch) patch.usdc_deposit_external_id = normalizeOptionalString(input.usdc_deposit_external_id);
  if ('usdc_deposit_ramp_operation_id' in patch) patch.usdc_deposit_ramp_operation_id = normalizeOptionalString(input.usdc_deposit_ramp_operation_id);
  if ('usdc_deposit_address' in patch) patch.usdc_deposit_address = normalizeOptionalString(input.usdc_deposit_address);
  if ('usdc_deposit_memo' in patch) patch.usdc_deposit_memo = normalizeOptionalString(input.usdc_deposit_memo);
  if ('usdc_received_amount' in patch) patch.usdc_received_amount = normalizeOptionalString(input.usdc_received_amount);
  if ('usdc_received_tx_hash' in patch) patch.usdc_received_tx_hash = normalizeOptionalString(input.usdc_received_tx_hash);
  if ('brh_issue_external_id' in patch) patch.brh_issue_external_id = normalizeOptionalString(input.brh_issue_external_id);
  if ('brh_issue_ramp_operation_id' in patch) patch.brh_issue_ramp_operation_id = normalizeOptionalString(input.brh_issue_ramp_operation_id);
  if ('brh_redemption_external_id' in patch) patch.brh_redemption_external_id = normalizeOptionalString(input.brh_redemption_external_id);
  if ('brh_redemption_ramp_operation_id' in patch) patch.brh_redemption_ramp_operation_id = normalizeOptionalString(input.brh_redemption_ramp_operation_id);
  if ('binance_symbol' in patch) patch.binance_symbol = normalizeOptionalString(input.binance_symbol);
  if ('binance_client_order_id' in patch) patch.binance_client_order_id = normalizeOptionalString(input.binance_client_order_id);
  if ('binance_order_id' in patch) patch.binance_order_id = normalizeOptionalString(input.binance_order_id);
  if ('binance_executed_qty' in patch) patch.binance_executed_qty = normalizeOptionalString(input.binance_executed_qty);
  if ('binance_cummulative_quote_qty' in patch) patch.binance_cummulative_quote_qty = normalizeOptionalString(input.binance_cummulative_quote_qty);
  if ('binance_status' in patch) patch.binance_status = normalizeOptionalString(input.binance_status);
  if ('failure_code' in patch) patch.failure_code = normalizeOptionalString(input.failure_code);
  if ('failure_reason' in patch) patch.failure_reason = normalizeOptionalString(input.failure_reason);
  if ('needs_review_reason' in patch) patch.needs_review_reason = normalizeOptionalString(input.needs_review_reason);
  if ('created_by_email' in patch) {
    const email = normalizeOptionalString(input.created_by_email);
    patch.created_by_email = email ? email.toLowerCase() : null;
  }

  return patch;
}

export async function findOfframpOrderById(orderId: string): Promise<OfframpOrderRow | null> {
  const admin = createSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin.from(OFFRAMP_ORDERS_TABLE).select('*').eq('id', orderId).maybeSingle();
  if (error) {
    console.error('[offramp/store] find by id failed', error.message);
    return null;
  }

  return (data as OfframpOrderRow | null) ?? null;
}

export async function findOfframpOrderByUsdcDepositExternalId(externalId: string): Promise<OfframpOrderRow | null> {
  const admin = createSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin
    .from(OFFRAMP_ORDERS_TABLE)
    .select('*')
    .eq('usdc_deposit_external_id', externalId)
    .maybeSingle();
  if (error) {
    console.error('[offramp/store] find by usdc deposit external id failed', error.message);
    return null;
  }
  return (data as OfframpOrderRow | null) ?? null;
}

export async function findOfframpOrderByBrhRedemptionExternalId(
  externalId: string,
): Promise<OfframpOrderRow | null> {
  const admin = createSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin
    .from(OFFRAMP_ORDERS_TABLE)
    .select('*')
    .eq('brh_redemption_external_id', externalId)
    .maybeSingle();
  if (error) {
    console.error('[offramp/store] find by brh redemption external id failed', error.message);
    return null;
  }

  return (data as OfframpOrderRow | null) ?? null;
}

export async function createQuotedOfframpOrder(input: {
  amountUsdc: string;
  amountBrl: string;
  payoutPixKey: string;
  payoutBeneficiaryName?: string | null;
  quoteSymbol?: string;
  quoteSide?: 'BUY' | 'SELL';
  quoteExpiresAt: string;
  quoteRate?: string | null;
  quoteSource?: string | null;
  quoteSpreadBps?: number | null;
  createdByUserId?: string | null;
  createdByEmail?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<{ ok: true; row: OfframpOrderRow } | { ok: false; reason: string }> {
  const admin = createSupabaseAdmin();
  if (!admin) return { ok: false, reason: 'SUPABASE_SERVICE_ROLE_KEY missing' };

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from(OFFRAMP_ORDERS_TABLE)
    .insert({
      status: 'quoted',
      amount_usdc: input.amountUsdc.trim(),
      amount_brl: input.amountBrl.trim(),
      payout_pix_key: input.payoutPixKey.trim(),
      payout_beneficiary_name: normalizeOptionalString(input.payoutBeneficiaryName),
      quote_symbol: input.quoteSymbol?.trim().toUpperCase() || 'USDCBRL',
      quote_side: input.quoteSide ?? 'SELL',
      quote_expires_at: input.quoteExpiresAt,
      quote_rate: normalizeOptionalString(input.quoteRate),
      quote_source: normalizeOptionalString(input.quoteSource),
      quote_spread_bps: input.quoteSpreadBps ?? null,
      created_by_user_id: normalizeOptionalString(input.createdByUserId),
      created_by_email: normalizeOptionalString(input.createdByEmail)?.toLowerCase() ?? null,
      metadata: input.metadata ?? {},
      quoted_at: now,
      updated_at: now,
    })
    .select('*')
    .single();

  if (error) return { ok: false, reason: error.message };
  return { ok: true, row: data as OfframpOrderRow };
}

export async function lockQuotedOfframpOrderWithDeposit(input: {
  orderId: string;
  usdcDepositExternalId: string;
  usdcDepositAddress: string;
  usdcDepositMemo?: string | null;
  usdcDepositRampOperationId?: string | null;
}): Promise<{ ok: true; row: OfframpOrderRow } | { ok: false; reason: string }> {
  const admin = createSupabaseAdmin();
  if (!admin) return { ok: false, reason: 'SUPABASE_SERVICE_ROLE_KEY missing' };

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from(OFFRAMP_ORDERS_TABLE)
    .update({
      status: 'awaiting_deposit',
      quote_locked_at: now,
      usdc_deposit_external_id: input.usdcDepositExternalId.trim(),
      usdc_deposit_address: input.usdcDepositAddress.trim(),
      usdc_deposit_memo: normalizeOptionalString(input.usdcDepositMemo),
      usdc_deposit_ramp_operation_id: normalizeOptionalString(input.usdcDepositRampOperationId),
      updated_at: now,
    })
    .eq('id', input.orderId)
    .eq('status', 'quoted')
    .select('*')
    .maybeSingle();

  if (error) return { ok: false, reason: error.message };
  if (!data) return { ok: false, reason: 'order not found or not in quoted state' };
  return { ok: true, row: data as OfframpOrderRow };
}

export async function updateOfframpOrder(input: {
  orderId: string;
  patch: UpdateOfframpOrderPatch;
  expectedStatus?: OfframpOrderStatus | OfframpOrderStatus[];
}): Promise<{ ok: true; row: OfframpOrderRow } | { ok: false; reason: string }> {
  const admin = createSupabaseAdmin();
  if (!admin) return { ok: false, reason: 'SUPABASE_SERVICE_ROLE_KEY missing' };

  let query = admin.from(OFFRAMP_ORDERS_TABLE).update(normalizeUpdatePatch(input.patch)).eq('id', input.orderId);
  if (input.expectedStatus) {
    query = Array.isArray(input.expectedStatus)
      ? query.in('status', input.expectedStatus)
      : query.eq('status', input.expectedStatus);
  }

  const { data, error } = await query.select('*').maybeSingle();
  if (error) return { ok: false, reason: error.message };
  if (!data) return { ok: false, reason: 'order not found or current status does not match expected state' };
  return { ok: true, row: data as OfframpOrderRow };
}

export async function markOfframpOrderStatus(input: {
  orderId: string;
  status: OfframpOrderStatus;
  expectedStatus?: OfframpOrderStatus | OfframpOrderStatus[];
  patch?: UpdateOfframpOrderPatch;
  at?: string;
}): Promise<{ ok: true; row: OfframpOrderRow } | { ok: false; reason: string }> {
  const at = input.at ?? new Date().toISOString();
  return updateOfframpOrder({
    orderId: input.orderId,
    expectedStatus: input.expectedStatus,
    patch: {
      ...buildStatusTimestampPatch(input.status, at),
      ...(input.patch ?? {}),
      status: input.status,
    },
  });
}
