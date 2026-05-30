import '@/lib/server/only';

import { binance } from '@/lib/server/binance';

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
  isBinanceClientOrderId,
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

const RECONCILIATION_START_STATUSES = ['usdc_delivered', 'needs_review', 'fx_settled', 'brh_redeemed'] as const;

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

async function ensureTradeClientOrderId(order: OnrampOrderRow): Promise<OnrampOrderRow | null> {
  if (order.binance_client_order_id && isBinanceClientOrderId(order.binance_client_order_id)) {
    return order;
  }

  const prepared = await updateOnrampOrder({
    orderId: order.id,
    expectedStatus: [...RECONCILIATION_START_STATUSES, 'complete'],
    patch: {
      binance_client_order_id: buildOnrampBinanceClientOrderId(order.id),
    },
  });

  if (!prepared.ok) {
    console.error('[onramp/reconcile] failed to persist binance client order id', {
      orderId: order.id,
      reason: prepared.reason,
    });
    return null;
  }

  return prepared.row;
}

async function ensureWithdrawOrderId(order: OnrampOrderRow): Promise<OnrampOrderRow | null> {
  if (order.binance_withdraw_order_id && isBinanceClientOrderId(order.binance_withdraw_order_id)) {
    return order;
  }

  const prepared = await updateOnrampOrder({
    orderId: order.id,
    expectedStatus: [...RECONCILIATION_START_STATUSES, 'complete'],
    patch: {
      binance_withdraw_order_id: buildOnrampBinanceWithdrawOrderId(order.id),
    },
  });

  if (!prepared.ok) {
    console.error('[onramp/reconcile] failed to persist binance withdraw order id', {
      orderId: order.id,
      reason: prepared.reason,
    });
    return null;
  }

  return prepared.row;
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

async function requestBinanceWithdraw(order: OnrampOrderRow): Promise<OnrampOrderRow | null> {
  if (order.binance_withdraw_id) {
    if (order.status === 'brh_redeemed') {
      const updated = await markOnrampOrderStatus({
        orderId: order.id,
        status: 'complete',
        expectedStatus: ['brh_redeemed', 'needs_review', 'complete'],
        patch: clearOnrampFailurePatch(),
      });

      if (updated.ok) {
        return updated.row;
      }
    }

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

  const withdrawAmount = prepared.binance_executed_qty ?? prepared.amount_usdc;

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

    const updated = await markOnrampOrderStatus({
      orderId: prepared.id,
      status: 'complete',
      expectedStatus: ['brh_redeemed', 'needs_review', 'complete'],
      patch: {
        binance_withdraw_order_id: prepared.binance_withdraw_order_id,
        binance_withdraw_id: result.id,
        binance_withdraw_network: distributor.network,
        binance_withdraw_amount: withdrawAmount,
        ...clearOnrampFailurePatch(),
      },
    });

    if (!updated.ok) {
      await markReconciliationNeedsReview(
        prepared.id,
        ONRAMP_FAILURE_CODES.WITHDRAW_PERSIST_FAILED,
        `Falha ao persistir o withdraw Binance: ${updated.reason}`,
      );
      return null;
    }

    console.info('[onramp/reconcile] binance withdraw requested', {
      orderId: updated.row.id,
      withdrawId: result.id,
      withdrawOrderId: prepared.binance_withdraw_order_id,
      amount: withdrawAmount,
      network: distributor.network,
    });

    return updated.row;
  } catch (error) {
    await markReconciliationNeedsReview(
      prepared.id,
      ONRAMP_FAILURE_CODES.WITHDRAW_REQUEST_FAILED,
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

export async function startOnrampReconciliation(orderId: string): Promise<void> {
  const normalizedOrderId = orderId.trim();
  if (!normalizedOrderId) {
    throw new OnrampOperationError('On-ramp order id is required.', 400);
  }

  const order = await findOnrampOrderById(normalizedOrderId);
  if (!order) {
    throw new OnrampOperationError('On-ramp order not found.', 404);
  }

  if (order.status === 'complete') {
    return;
  }

  if (!RECONCILIATION_START_STATUSES.includes(order.status as (typeof RECONCILIATION_START_STATUSES)[number])) {
    throw new OnrampOperationError(
      `On-ramp reconciliation cannot start from status "${order.status}".`,
      409,
    );
  }

  if (order.status === 'needs_review' && !order.usdc_delivered_at) {
    throw new OnrampOperationError(
      'On-ramp reconciliation requires a delivered order or a post-delivery retry context.',
      409,
    );
  }

  const afterTrade = await executeBinanceTrade(order);
  if (!afterTrade) return;

  const afterRedemption = await registerBrhRedemption(afterTrade);
  if (!afterRedemption) return;

  await requestBinanceWithdraw(afterRedemption);
}
