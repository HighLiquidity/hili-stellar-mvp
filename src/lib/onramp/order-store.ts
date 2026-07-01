import '@/lib/server/only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { OnrampFailureCode } from './failure-codes';

export const ONRAMP_ORDERS_TABLE = 'onramp_orders';

export type OnrampOrderStatus =
  | 'quoted'
  | 'awaiting_pix'
  | 'pix_received'
  | 'brh_sold'
  | 'usdc_delivered'
  | 'fx_settled'
  | 'brh_redeemed'
  | 'complete'
  | 'expired'
  | 'failed'
  | 'refunded'
  | 'needs_review';

export type OnrampOrderRow = {
  id: string;
  status: OnrampOrderStatus;
  tax_id: string;
  amount_brl: string;
  amount_usdc: string;
  destination_address: string;
  destination_memo: string | null;
  quote_symbol: string;
  quote_side: 'BUY' | 'SELL';
  quote_expires_at: string;
  quote_locked_at: string | null;
  quote_rate: string | null;
  quote_source: string | null;
  quote_spread_bps: number | null;
  corpx_txid: string | null;
  corpx_identifier: string | null;
  corpx_expires_at: string | null;
  pix_copy_paste: string | null;
  corpx_event_type: string | null;
  corpx_transaction_id: string | null;
  end_to_end_id: string | null;
  brh_sale_external_id: string | null;
  brh_sale_ramp_operation_id: string | null;
  usdc_delivery_external_id: string | null;
  usdc_delivery_ramp_operation_id: string | null;
  usdc_delivery_tx_hash: string | null;
  binance_symbol: string | null;
  binance_side: 'BUY' | 'SELL' | null;
  binance_quote_order_qty: string | null;
  binance_client_order_id: string | null;
  binance_order_id: string | null;
  binance_executed_qty: string | null;
  binance_cummulative_quote_qty: string | null;
  binance_status: string | null;
  brh_redemption_external_id: string | null;
  brh_redemption_ramp_operation_id: string | null;
  binance_withdraw_order_id: string | null;
  binance_withdraw_id: string | null;
  binance_withdraw_network: string | null;
  binance_withdraw_amount: string | null;
  failure_code: OnrampFailureCode | null;
  failure_reason: string | null;
  needs_review_reason: string | null;
  created_by_user_id: string | null;
  created_by_email: string | null;
  client_id?: string | null;
  integrator_external_id: string | null;
  quoted_at: string;
  pix_received_at: string | null;
  brh_sold_at: string | null;
  usdc_delivered_at: string | null;
  fx_settled_at: string | null;
  brh_redeemed_at: string | null;
  complete_at: string | null;
  expired_at: string | null;
  refunded_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type UpdateOnrampOrderPatch = Partial<
  Omit<
    OnrampOrderRow,
    | 'id'
    | 'created_at'
    | 'updated_at'
    | 'quoted_at'
    | 'metadata'
    | 'quote_side'
    | 'binance_side'
  >
> & {
  quote_side?: 'BUY' | 'SELL';
  binance_side?: 'BUY' | 'SELL' | null;
  metadata?: Record<string, unknown> | null;
};

function normalizeOptionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function buildStatusTimestampPatch(status: OnrampOrderStatus, at: string): Partial<OnrampOrderRow> {
  switch (status) {
    case 'quoted':
      return { quoted_at: at };
    case 'pix_received':
      return { pix_received_at: at };
    case 'brh_sold':
      return { brh_sold_at: at };
    case 'usdc_delivered':
      return { usdc_delivered_at: at };
    case 'fx_settled':
      return { fx_settled_at: at };
    case 'brh_redeemed':
      return { brh_redeemed_at: at };
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

function normalizeUpdatePatch(input: UpdateOnrampOrderPatch): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    ...input,
    updated_at: new Date().toISOString(),
  };

  if ('destination_memo' in patch) patch.destination_memo = normalizeOptionalString(input.destination_memo);
  if ('corpx_identifier' in patch) patch.corpx_identifier = normalizeOptionalString(input.corpx_identifier);
  if ('pix_copy_paste' in patch) patch.pix_copy_paste = normalizeOptionalString(input.pix_copy_paste);
  if ('corpx_event_type' in patch) patch.corpx_event_type = normalizeOptionalString(input.corpx_event_type);
  if ('corpx_transaction_id' in patch) patch.corpx_transaction_id = normalizeOptionalString(input.corpx_transaction_id);
  if ('end_to_end_id' in patch) patch.end_to_end_id = normalizeOptionalString(input.end_to_end_id);
  if ('brh_sale_external_id' in patch) patch.brh_sale_external_id = normalizeOptionalString(input.brh_sale_external_id);
  if ('brh_sale_ramp_operation_id' in patch)
    patch.brh_sale_ramp_operation_id = normalizeOptionalString(input.brh_sale_ramp_operation_id);
  if ('usdc_delivery_external_id' in patch)
    patch.usdc_delivery_external_id = normalizeOptionalString(input.usdc_delivery_external_id);
  if ('usdc_delivery_ramp_operation_id' in patch)
    patch.usdc_delivery_ramp_operation_id = normalizeOptionalString(input.usdc_delivery_ramp_operation_id);
  if ('usdc_delivery_tx_hash' in patch)
    patch.usdc_delivery_tx_hash = normalizeOptionalString(input.usdc_delivery_tx_hash);
  if ('binance_symbol' in patch) patch.binance_symbol = normalizeOptionalString(input.binance_symbol);
  if ('binance_client_order_id' in patch)
    patch.binance_client_order_id = normalizeOptionalString(input.binance_client_order_id);
  if ('binance_order_id' in patch) patch.binance_order_id = normalizeOptionalString(input.binance_order_id);
  if ('binance_executed_qty' in patch)
    patch.binance_executed_qty = normalizeOptionalString(input.binance_executed_qty);
  if ('binance_cummulative_quote_qty' in patch)
    patch.binance_cummulative_quote_qty = normalizeOptionalString(input.binance_cummulative_quote_qty);
  if ('binance_status' in patch) patch.binance_status = normalizeOptionalString(input.binance_status);
  if ('brh_redemption_external_id' in patch)
    patch.brh_redemption_external_id = normalizeOptionalString(input.brh_redemption_external_id);
  if ('brh_redemption_ramp_operation_id' in patch)
    patch.brh_redemption_ramp_operation_id = normalizeOptionalString(input.brh_redemption_ramp_operation_id);
  if ('binance_withdraw_order_id' in patch)
    patch.binance_withdraw_order_id = normalizeOptionalString(input.binance_withdraw_order_id);
  if ('binance_withdraw_id' in patch)
    patch.binance_withdraw_id = normalizeOptionalString(input.binance_withdraw_id);
  if ('binance_withdraw_network' in patch)
    patch.binance_withdraw_network = normalizeOptionalString(input.binance_withdraw_network);
  if ('binance_withdraw_amount' in patch)
    patch.binance_withdraw_amount = normalizeOptionalString(input.binance_withdraw_amount);
  if ('failure_code' in patch) patch.failure_code = normalizeOptionalString(input.failure_code);
  if ('failure_reason' in patch) patch.failure_reason = normalizeOptionalString(input.failure_reason);
  if ('needs_review_reason' in patch)
    patch.needs_review_reason = normalizeOptionalString(input.needs_review_reason);
  if ('created_by_email' in patch) {
    const email = normalizeOptionalString(input.created_by_email);
    patch.created_by_email = email ? email.toLowerCase() : null;
  }

  return patch;
}

export async function findOnrampOrderById(orderId: string): Promise<OnrampOrderRow | null> {
  const admin = createSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin.from(ONRAMP_ORDERS_TABLE).select('*').eq('id', orderId).maybeSingle();
  if (error) {
    console.error('[onramp/store] find by id failed', error.message);
    return null;
  }

  return (data as OnrampOrderRow | null) ?? null;
}

export async function findOnrampOrderByCorpXTxid(corpxTxid: string): Promise<OnrampOrderRow | null> {
  const admin = createSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin
    .from(ONRAMP_ORDERS_TABLE)
    .select('*')
    .eq('corpx_txid', corpxTxid)
    .maybeSingle();
  if (error) {
    console.error('[onramp/store] find by corpx txid failed', error.message);
    return null;
  }

  return (data as OnrampOrderRow | null) ?? null;
}

export async function findOnrampOrderByBrhSaleExternalId(
  brhSaleExternalId: string,
): Promise<OnrampOrderRow | null> {
  const admin = createSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin
    .from(ONRAMP_ORDERS_TABLE)
    .select('*')
    .eq('brh_sale_external_id', brhSaleExternalId)
    .maybeSingle();
  if (error) {
    console.error('[onramp/store] find by brh sale external id failed', error.message);
    return null;
  }

  return (data as OnrampOrderRow | null) ?? null;
}

export async function findOnrampOrderByIntegratorExternalId(input: {
  clientId?: string;
  userId?: string;
  externalId: string;
}): Promise<OnrampOrderRow | null> {
  const admin = createSupabaseAdmin();
  if (!admin) return null;

  const externalId = input.externalId.trim();
  if (!externalId) return null;

  let query = admin.from(ONRAMP_ORDERS_TABLE).select('*').eq('integrator_external_id', externalId);

  const clientId = input.clientId?.trim();
  const userId = input.userId?.trim();
  if (clientId) {
    query = query.eq('client_id', clientId);
  } else if (userId) {
    query = query.eq('created_by_user_id', userId);
  } else {
    return null;
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error('[onramp/store] find by integrator external id failed', error.message);
    return null;
  }

  return (data as OnrampOrderRow | null) ?? null;
}

export async function findOnrampOrderByUsdcDeliveryExternalId(
  usdcDeliveryExternalId: string,
): Promise<OnrampOrderRow | null> {
  const admin = createSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin
    .from(ONRAMP_ORDERS_TABLE)
    .select('*')
    .eq('usdc_delivery_external_id', usdcDeliveryExternalId)
    .maybeSingle();
  if (error) {
    console.error('[onramp/store] find by usdc delivery external id failed', error.message);
    return null;
  }

  return (data as OnrampOrderRow | null) ?? null;
}

export async function createQuotedOnrampOrder(input: {
  taxId: string;
  amountBrl: string;
  amountUsdc: string;
  destinationAddress: string;
  destinationMemo?: string | null;
  quoteSymbol?: string;
  quoteSide?: 'BUY' | 'SELL';
  quoteExpiresAt: string;
  quoteRate?: string | null;
  quoteSource?: string | null;
  quoteSpreadBps?: number | null;
  createdByUserId?: string | null;
  createdByEmail?: string | null;
  clientId?: string | null;
  integratorExternalId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<{ ok: true; row: OnrampOrderRow } | { ok: false; reason: string }> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    return { ok: false, reason: 'SUPABASE_SERVICE_ROLE_KEY missing' };
  }

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from(ONRAMP_ORDERS_TABLE)
    .insert({
      status: 'quoted',
      tax_id: input.taxId.trim(),
      amount_brl: input.amountBrl.trim(),
      amount_usdc: input.amountUsdc.trim(),
      destination_address: input.destinationAddress.trim(),
      destination_memo: normalizeOptionalString(input.destinationMemo),
      quote_symbol: input.quoteSymbol?.trim().toUpperCase() || 'USDCBRL',
      quote_side: input.quoteSide ?? 'BUY',
      quote_expires_at: input.quoteExpiresAt,
      quote_rate: normalizeOptionalString(input.quoteRate),
      quote_source: normalizeOptionalString(input.quoteSource),
      quote_spread_bps: input.quoteSpreadBps ?? null,
      created_by_user_id: normalizeOptionalString(input.createdByUserId),
      created_by_email: normalizeOptionalString(input.createdByEmail)?.toLowerCase() ?? null,
      client_id: normalizeOptionalString(input.clientId),
      integrator_external_id: normalizeOptionalString(input.integratorExternalId),
      metadata: input.metadata ?? {},
      quoted_at: now,
      updated_at: now,
    })
    .select('*')
    .single();

  if (error) {
    return { ok: false, reason: error.message };
  }

  return { ok: true, row: data as OnrampOrderRow };
}

export async function lockQuotedOnrampOrderWithPix(input: {
  orderId: string;
  corpxTxid: string;
  corpxIdentifier?: string | null;
  corpxExpiresAt?: string | null;
  pixCopyPaste?: string | null;
}): Promise<{ ok: true; row: OnrampOrderRow } | { ok: false; reason: string }> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    return { ok: false, reason: 'SUPABASE_SERVICE_ROLE_KEY missing' };
  }

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from(ONRAMP_ORDERS_TABLE)
    .update({
      status: 'awaiting_pix',
      quote_locked_at: now,
      corpx_txid: input.corpxTxid.trim(),
      corpx_identifier: normalizeOptionalString(input.corpxIdentifier),
      corpx_expires_at: input.corpxExpiresAt ?? null,
      pix_copy_paste: normalizeOptionalString(input.pixCopyPaste),
      updated_at: now,
    })
    .eq('id', input.orderId)
    .eq('status', 'quoted')
    .select('*')
    .maybeSingle();

  if (error) {
    return { ok: false, reason: error.message };
  }

  if (!data) {
    return { ok: false, reason: 'order not found or not in quoted state' };
  }

  return { ok: true, row: data as OnrampOrderRow };
}

export async function updateOnrampOrder(input: {
  orderId: string;
  patch: UpdateOnrampOrderPatch;
  expectedStatus?: OnrampOrderStatus | OnrampOrderStatus[];
}): Promise<{ ok: true; row: OnrampOrderRow } | { ok: false; reason: string }> {
  const admin = createSupabaseAdmin();
  if (!admin) {
    return { ok: false, reason: 'SUPABASE_SERVICE_ROLE_KEY missing' };
  }

  let query = admin.from(ONRAMP_ORDERS_TABLE).update(normalizeUpdatePatch(input.patch)).eq('id', input.orderId);

  if (input.expectedStatus) {
    query = Array.isArray(input.expectedStatus)
      ? query.in('status', input.expectedStatus)
      : query.eq('status', input.expectedStatus);
  }

  const { data, error } = await query.select('*').maybeSingle();
  if (error) {
    return { ok: false, reason: error.message };
  }

  if (!data) {
    return { ok: false, reason: 'order not found or current status does not match expected state' };
  }

  return { ok: true, row: data as OnrampOrderRow };
}

export async function markOnrampOrderStatus(input: {
  orderId: string;
  status: OnrampOrderStatus;
  expectedStatus?: OnrampOrderStatus | OnrampOrderStatus[];
  patch?: UpdateOnrampOrderPatch;
  at?: string;
}): Promise<{ ok: true; row: OnrampOrderRow } | { ok: false; reason: string }> {
  const at = input.at ?? new Date().toISOString();

  return updateOnrampOrder({
    orderId: input.orderId,
    expectedStatus: input.expectedStatus,
    patch: {
      ...buildStatusTimestampPatch(input.status, at),
      ...(input.patch ?? {}),
      status: input.status,
    },
  });
}
