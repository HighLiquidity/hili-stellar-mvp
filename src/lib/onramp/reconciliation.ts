import '@/lib/server/only';

import { binance } from '@/lib/server/binance';
import { BinanceRequestError } from '@/lib/server/binance/errors';

import { OnrampConfigError, OnrampOperationError } from './errors';
import {
  ONRAMP_FAILURE_CODES,
  buildOnrampFailurePatch,
  clearOnrampFailurePatch,
  type OnrampFailureCode,
} from './failure-codes';
import {
  findOnrampOrderById,
  markOnrampOrderStatus,
  type OnrampOrderRow,
  updateOnrampOrder,
} from './order-store';
import {
  needsBinanceClientOrderIdRefresh,
} from '@/lib/server/binance/client-order-id';
import {
  assertBinanceMarketQuoteNotionalForSymbol,
  formatBinanceTradeErrorMessage,
} from '@/lib/server/binance/exchange-info';
import {
  buildOnrampBinanceClientOrderId,
  buildOnrampBinanceWithdrawOrderId,
  buildOnrampBrhRedemptionExternalId,
} from './references';
import { startOnrampBrlCloseForOrderId } from '@/lib/treasury/onramp-brl-close';

const RECONCILIATION_START_STATUSES = ['usdc_delivered', 'needs_review', 'fx_settled', 'brh_redeemed'] as const;

type OnrampReconciliationContext = {
  /** Where reconciliation was triggered (webhook host vs manual retry). */
  source?: string;
};

function formatBinanceWithdrawError(error: unknown): string {
  if (error instanceof BinanceRequestError) {
    return error.code != null ? `${error.message} (code ${error.code})` : error.message;
  }

  return error instanceof Error ? error.message : String(error);
}

type DistributorConfig = {
  coin: 'USDC';
  address: string;
  network: string;
  addressTag?: string;
  name?: string;
};

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeRequiredString(value: string | undefined, fieldName: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new OnrampConfigError(`${fieldName} is required for on-ramp reconciliation.`);
  }

  return normalized;
}

function readDistributorConfig(): DistributorConfig {
  return {
    coin: 'USDC',
    address: normalizeRequiredString(
      process.env.ONRAMP_USDC_DISTRIBUTOR_ADDRESS,
      'ONRAMP_USDC_DISTRIBUTOR_ADDRESS',
    ),
    network: normalizeRequiredString(
      process.env.ONRAMP_USDC_DISTRIBUTOR_NETWORK,
      'ONRAMP_USDC_DISTRIBUTOR_NETWORK',
    ).toUpperCase(),
    addressTag: normalizeOptionalString(process.env.ONRAMP_USDC_DISTRIBUTOR_ADDRESS_TAG),
    name: normalizeOptionalString(process.env.ONRAMP_USDC_DISTRIBUTOR_NAME),
  };
}

async function markReconciliationNeedsReview(
  orderId: string,
  failureCode: OnrampFailureCode,
  reason: string,
) {
  const updated = await markOnrampOrderStatus({
    orderId,
    status: 'needs_review',
    expectedStatus: [...RECONCILIATION_START_STATUSES, 'complete'],
    patch: buildOnrampFailurePatch({ code: failureCode, reason }),
  });

  if (!updated.ok) {
    console.error('[onramp/reconcile] failed to mark needs_review', {
      orderId,
      failureCode,
      reason,
      updateReason: updated.reason,
    });
  }
}

/** Ensures Binance trade/withdraw ids are legal before the first reconciliation attempt. */
export async function prepareOnrampBinanceReconciliationIds(
  order: OnrampOrderRow,
): Promise<OnrampOrderRow | null> {
  const patch: {
    binance_client_order_id?: string;
    binance_withdraw_order_id?: string;
  } = {};

  if (needsBinanceClientOrderIdRefresh(order.binance_client_order_id)) {
    patch.binance_client_order_id = buildOnrampBinanceClientOrderId(order.id);
  }

  if (needsBinanceClientOrderIdRefresh(order.binance_withdraw_order_id)) {
    patch.binance_withdraw_order_id = buildOnrampBinanceWithdrawOrderId(order.id);
  }

  if (Object.keys(patch).length === 0) {
    return order;
  }

  const prepared = await updateOnrampOrder({
    orderId: order.id,
    expectedStatus: [...RECONCILIATION_START_STATUSES, 'complete'],
    patch,
  });

  if (!prepared.ok) {
    console.error('[onramp/reconcile] failed to persist binance reconciliation ids', {
      orderId: order.id,
      reason: prepared.reason,
      patch,
    });
    return null;
  }

  return prepared.row;
}

async function ensureTradeClientOrderId(order: OnrampOrderRow): Promise<OnrampOrderRow | null> {
  return prepareOnrampBinanceReconciliationIds(order);
}

async function ensureWithdrawOrderId(order: OnrampOrderRow): Promise<OnrampOrderRow | null> {
  if (needsBinanceClientOrderIdRefresh(order.binance_withdraw_order_id)) {
    return prepareOnrampBinanceReconciliationIds(order);
  }

  return order;
}

async function executeBinanceTrade(order: OnrampOrderRow): Promise<OnrampOrderRow | null> {
  if (order.binance_order_id) {
    if (order.status === 'usdc_delivered') {
      const updated = await markOnrampOrderStatus({
        orderId: order.id,
        status: 'fx_settled',
        expectedStatus: ['usdc_delivered', 'needs_review', 'fx_settled'],
        patch: clearOnrampFailurePatch(),
      });

      if (updated.ok) {
        return updated.row;
      }
    }

    if (order.failure_reason || order.failure_code) {
      const cleared = await updateOnrampOrder({
        orderId: order.id,
        expectedStatus: [...RECONCILIATION_START_STATUSES, 'complete'],
        patch: clearOnrampFailurePatch(),
      });

      if (cleared.ok) {
        return cleared.row;
      }
    }

    return order;
  }

  const prepared = await ensureTradeClientOrderId(order);
  if (!prepared?.binance_client_order_id) {
    await markReconciliationNeedsReview(
      order.id,
      ONRAMP_FAILURE_CODES.FX_PREPARE_FAILED,
      'Não foi possível persistir o client order id da recompra Binance.',
    );
    return null;
  }

  try {
    await assertBinanceMarketQuoteNotionalForSymbol(prepared.quote_symbol, prepared.amount_brl);

    const result = await binance.market.placeMarketOrderByQuoteAmount({
      symbol: prepared.quote_symbol,
      side: prepared.quote_side,
      quoteOrderQty: prepared.amount_brl,
      newClientOrderId: prepared.binance_client_order_id,
    });

    const updated = await markOnrampOrderStatus({
      orderId: prepared.id,
      status: 'fx_settled',
      expectedStatus: ['usdc_delivered', 'needs_review', 'fx_settled'],
      patch: {
        binance_symbol: result.symbol,
        binance_side: result.side,
        binance_quote_order_qty: prepared.amount_brl,
        binance_client_order_id: prepared.binance_client_order_id,
        binance_order_id: String(result.orderId),
        binance_executed_qty: result.executedQty,
        binance_cummulative_quote_qty: result.cummulativeQuoteQty,
        binance_status: result.status,
        ...clearOnrampFailurePatch(),
      },
    });

    if (!updated.ok) {
      await markReconciliationNeedsReview(
        prepared.id,
        ONRAMP_FAILURE_CODES.FX_PERSIST_FAILED,
        `Falha ao persistir o resultado da recompra Binance: ${updated.reason}`,
      );
      return null;
    }

    console.info('[onramp/reconcile] fx settled', {
      orderId: updated.row.id,
      orderIdBinance: result.orderId,
      executedQty: result.executedQty,
      quoteQty: result.cummulativeQuoteQty,
    });

    return updated.row;
  } catch (error) {
    await markReconciliationNeedsReview(
      prepared.id,
      ONRAMP_FAILURE_CODES.FX_TRADE_FAILED,
      formatBinanceTradeErrorMessage(error, prepared.quote_symbol),
    );
    return null;
  }
}

async function registerBrhRedemption(order: OnrampOrderRow): Promise<OnrampOrderRow | null> {
  if (order.status === 'brh_redeemed' || order.status === 'complete') {
    return order;
  }

  const updated = await markOnrampOrderStatus({
    orderId: order.id,
    status: 'brh_redeemed',
    expectedStatus: ['fx_settled', 'needs_review', 'brh_redeemed'],
    patch: {
      brh_redemption_external_id: order.brh_redemption_external_id ?? buildOnrampBrhRedemptionExternalId(order.id),
      ...clearOnrampFailurePatch(),
    },
  });

  if (!updated.ok) {
    await markReconciliationNeedsReview(
      order.id,
      ONRAMP_FAILURE_CODES.BRH_REDEMPTION_RECORD_FAILED,
      `Falha ao registrar a redenção local de BRH: ${updated.reason}`,
    );
    return null;
  }

  console.info('[onramp/reconcile] brh redemption recorded locally', {
    orderId: updated.row.id,
    externalId: updated.row.brh_redemption_external_id,
  });

  return updated.row;
}

async function resolveBinanceWithdrawAmount(
  order: OnrampOrderRow,
): Promise<{ ok: true; order: OnrampOrderRow; amount: string } | { ok: false; reason: string }> {
  const symbol = (order.binance_symbol ?? order.quote_symbol)?.trim().toUpperCase();
  if (!symbol) {
    return { ok: false, reason: 'Símbolo Binance da ordem não encontrado para calcular o saque.' };
  }

  let executedQty = order.binance_executed_qty?.trim() ?? '';
  let binanceStatus = order.binance_status;

  const refreshFromBinance = async (query: { orderId?: string; origClientOrderId?: string }) => {
    const remote = await binance.market.getSpotOrder({
      symbol,
      ...query,
    });

    if (remote.executedQty?.trim()) {
      executedQty = remote.executedQty.trim();
    }

    binanceStatus = remote.status;
  };

  if (order.binance_order_id) {
    try {
      await refreshFromBinance({ orderId: order.binance_order_id });
    } catch (error) {
      console.warn('[onramp/reconcile] failed to refresh binance trade by order id', {
        orderId: order.id,
        binanceOrderId: order.binance_order_id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!executedQty && order.binance_client_order_id) {
    try {
      await refreshFromBinance({ origClientOrderId: order.binance_client_order_id });
    } catch (error) {
      console.warn('[onramp/reconcile] failed to refresh binance trade by client order id', {
        orderId: order.id,
        binanceClientOrderId: order.binance_client_order_id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!executedQty && order.amount_usdc?.trim()) {
    executedQty = order.amount_usdc.trim();
  }

  if (!executedQty) {
    return {
      ok: false,
      reason:
        'Quantidade executada na recompra Binance é obrigatória antes do saque. O saque usa o valor bruto do trade; a taxa de rede é descontada pela Binance.',
    };
  }

  let withdrawAmount: string;
  try {
    withdrawAmount = normalizeBinanceUsdcAmount(executedQty, 'binance_executed_qty');
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  const patch: {
    binance_executed_qty?: string;
    binance_status?: string;
  } = {};

  if (withdrawAmount !== order.binance_executed_qty?.trim()) {
    patch.binance_executed_qty = withdrawAmount;
  }

  if (binanceStatus?.trim() && binanceStatus !== order.binance_status) {
    patch.binance_status = binanceStatus.trim();
  }

  if (Object.keys(patch).length === 0) {
    return { ok: true, order, amount: withdrawAmount };
  }

  const updated = await updateOnrampOrder({
    orderId: order.id,
    expectedStatus: [...RECONCILIATION_START_STATUSES, 'complete'],
    patch,
  });

  if (!updated.ok) {
    console.warn('[onramp/reconcile] failed to persist refreshed binance trade snapshot', {
      orderId: order.id,
      reason: updated.reason,
      patch,
    });
    return { ok: true, order, amount: withdrawAmount };
  }

  return { ok: true, order: updated.row, amount: withdrawAmount };
}

async function completeOnrampOrderAfterBinanceWithdraw(
  order: OnrampOrderRow,
  patch: {
    binance_withdraw_order_id?: string | null;
    binance_withdraw_id: string;
    binance_withdraw_amount?: string | null;
    binance_withdraw_network?: string | null;
  },
): Promise<OnrampOrderRow | null> {
  const updated = await markOnrampOrderStatus({
    orderId: order.id,
    status: 'complete',
    expectedStatus: ['brh_redeemed', 'needs_review', 'fx_settled', 'complete'],
    patch: {
      ...patch,
      ...clearOnrampFailurePatch(),
    },
  });

  if (!updated.ok) {
    await markReconciliationNeedsReview(
      order.id,
      ONRAMP_FAILURE_CODES.WITHDRAW_PERSIST_FAILED,
      `Falha ao persistir o withdraw Binance: ${updated.reason}`,
    );
    return null;
  }

  return updated.row;
}

async function syncExistingBinanceWithdraw(order: OnrampOrderRow): Promise<OnrampOrderRow | null> {
  if (order.binance_withdraw_id) {
    return completeOnrampOrderAfterBinanceWithdraw(order, {
      binance_withdraw_order_id: order.binance_withdraw_order_id,
      binance_withdraw_id: order.binance_withdraw_id,
      binance_withdraw_amount: order.binance_withdraw_amount,
      binance_withdraw_network: order.binance_withdraw_network,
    });
  }

  const withdrawOrderId = order.binance_withdraw_order_id?.trim();
  if (!withdrawOrderId) {
    return null;
  }

  try {
    const record = await binance.withdraw.getWithdrawByOrderId(withdrawOrderId);
    if (!record?.id) {
      return null;
    }

    return completeOnrampOrderAfterBinanceWithdraw(order, {
      binance_withdraw_order_id: withdrawOrderId,
      binance_withdraw_id: record.id,
      binance_withdraw_amount: record.amount,
      binance_withdraw_network: record.network?.toUpperCase() ?? order.binance_withdraw_network,
    });
  } catch (error) {
    console.warn('[onramp/reconcile] failed to sync existing binance withdraw', {
      orderId: order.id,
      withdrawOrderId,
      reason: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function requestBinanceWithdraw(
  order: OnrampOrderRow,
  context: OnrampReconciliationContext = {},
): Promise<OnrampOrderRow | null> {
  const synced = await syncExistingBinanceWithdraw(order);
  if (synced) {
    console.info('[onramp/reconcile] binance withdraw already recorded', {
      orderId: synced.id,
      withdrawId: synced.binance_withdraw_id,
      withdrawOrderId: synced.binance_withdraw_order_id,
    });
    return synced;
  }

  if (order.binance_withdraw_id) {
    return order;
  }

  const prepared = await ensureWithdrawOrderId(order);
  if (!prepared?.binance_withdraw_order_id) {
    await markReconciliationNeedsReview(
      order.id,
      ONRAMP_FAILURE_CODES.WITHDRAW_PREPARE_FAILED,
      'Não foi possível persistir o withdrawOrderId da recompra Binance.',
    );
    return null;
  }

  let distributor: DistributorConfig;
  try {
    distributor = readDistributorConfig();
  } catch (error) {
    await markReconciliationNeedsReview(
      prepared.id,
      ONRAMP_FAILURE_CODES.WITHDRAW_CONFIG_MISSING,
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }

  const resolved = await resolveBinanceWithdrawAmount(prepared);
  if (!resolved.ok) {
    await markReconciliationNeedsReview(
      prepared.id,
      ONRAMP_FAILURE_CODES.WITHDRAW_PREPARE_FAILED,
      resolved.reason,
    );
    return null;
  }

  const withdrawOrder = resolved.order;
  const withdrawAmount = resolved.amount;

  try {
    const result = await binance.withdraw.requestCryptoWithdraw({
      coin: distributor.coin,
      address: distributor.address,
      amount: withdrawAmount,
      network: distributor.network,
      addressTag: distributor.addressTag,
      name: distributor.name,
      withdrawOrderId: prepared.binance_withdraw_order_id,
    });

    const completed = await completeOnrampOrderAfterBinanceWithdraw(withdrawOrder, {
      binance_withdraw_order_id: prepared.binance_withdraw_order_id,
      binance_withdraw_id: result.id,
      binance_withdraw_amount: withdrawAmount,
      binance_withdraw_network: distributor.network,
    });

    if (!completed) {
      return null;
    }

    await updateOnrampOrder({
      orderId: completed.id,
      expectedStatus: 'complete',
      patch: {
        binance_executed_qty: withdrawAmount,
      },
    });

    console.info('[onramp/reconcile] binance withdraw requested', {
      orderId: completed.id,
      withdrawId: result.id,
      withdrawOrderId: prepared.binance_withdraw_order_id,
      amount: withdrawAmount,
      network: distributor.network,
      source: context.source ?? 'unknown',
    });

    return completed;
  } catch (error) {
    const reason = formatBinanceWithdrawError(error);
    console.error('[onramp/reconcile] binance withdraw failed', {
      orderId: prepared.id,
      withdrawOrderId: prepared.binance_withdraw_order_id,
      source: context.source ?? 'unknown',
      reason,
      binanceCode: error instanceof BinanceRequestError ? error.code : null,
      binanceStatus: error instanceof BinanceRequestError ? error.status : null,
    });
    await markReconciliationNeedsReview(
      prepared.id,
      ONRAMP_FAILURE_CODES.WITHDRAW_REQUEST_FAILED,
      reason,
    );
    return null;
  }
}

export async function startOnrampReconciliation(
  orderId: string,
  context: OnrampReconciliationContext = {},
): Promise<void> {
  const normalizedOrderId = orderId.trim();
  if (!normalizedOrderId) {
    throw new OnrampOperationError('On-ramp order id is required.', 400);
  }

  const order = await findOnrampOrderById(normalizedOrderId);
  if (!order) {
    throw new OnrampOperationError('On-ramp order not found.', 404);
  }

  console.info('[onramp/reconcile] starting', {
    orderId: normalizedOrderId,
    status: order.status,
    source: context.source ?? 'unknown',
    hasBinanceOrderId: Boolean(order.binance_order_id),
    hasBinanceWithdrawId: Boolean(order.binance_withdraw_id),
  });

  let activeOrder = order;

  if (
    activeOrder.usdc_delivered_at &&
    (activeOrder.failure_code || activeOrder.failure_reason || activeOrder.needs_review_reason)
  ) {
    const cleared = await updateOnrampOrder({
      orderId: activeOrder.id,
      expectedStatus: [...RECONCILIATION_START_STATUSES, 'complete'],
      patch: clearOnrampFailurePatch(),
    });

    if (cleared.ok) {
      activeOrder = cleared.row;
    }
  }

  if (activeOrder.status === 'complete') {
    await startOnrampBrlCloseForOrderId(activeOrder.id);
    return;
  }

  if (!RECONCILIATION_START_STATUSES.includes(activeOrder.status as (typeof RECONCILIATION_START_STATUSES)[number])) {
    throw new OnrampOperationError(
      `On-ramp reconciliation cannot start from status "${activeOrder.status}".`,
      409,
    );
  }

  if (activeOrder.status === 'needs_review' && !activeOrder.usdc_delivered_at) {
    throw new OnrampOperationError(
      'On-ramp reconciliation requires a delivered order or a post-delivery retry context.',
      409,
    );
  }

  const prepared = await prepareOnrampBinanceReconciliationIds(activeOrder);
  if (!prepared) {
    await markReconciliationNeedsReview(
      activeOrder.id,
      ONRAMP_FAILURE_CODES.FX_PREPARE_FAILED,
      'Não foi possível preparar os ids Binance da reconciliação.',
    );
    return;
  }

  const afterTrade = await executeBinanceTrade(prepared);
  if (!afterTrade) return;

  const brlClose = startOnrampBrlCloseForOrderId(afterTrade.id);
  try {
    const afterRedemption = await registerBrhRedemption(afterTrade);
    if (!afterRedemption) return;

    await requestBinanceWithdraw(afterRedemption, context);
  } finally {
    await brlClose;
  }
}
