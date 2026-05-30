import '@/lib/server/only';

import { BinanceClient, createBinanceClient } from './client';
import { normalizeBinanceClientOrderId } from './client-order-id';
import { BinanceValidationError } from './errors';
import type {
  BinanceMarketOrderByQuoteAmountRequest,
  BinanceMarketOrderRequest,
  BinanceMarketOrderResponse,
  BinanceOrderSide,
  BinanceTickerPrice,
} from './types';

function normalizeTickerSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) {
    throw new BinanceValidationError('Binance symbol is required');
  }

  return normalized;
}

function normalizeOrderSide(side: BinanceOrderSide): BinanceOrderSide {
  if (side !== 'BUY' && side !== 'SELL') {
    throw new BinanceValidationError('Binance market order side must be BUY or SELL');
  }

  return side;
}

function normalizePositiveDecimalString(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new BinanceValidationError(`${fieldName} is required`);
  }

  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new BinanceValidationError(`${fieldName} must be a positive decimal string`);
  }

  if (!/[1-9]/.test(normalized)) {
    throw new BinanceValidationError(`${fieldName} must be greater than zero`);
  }

  return normalized;
}

function normalizeOptionalString(value: string | undefined, fieldName: string): string | undefined {
  if (value === undefined) return undefined;

  const normalized = value.trim();
  if (!normalized) {
    throw new BinanceValidationError(`${fieldName} must not be empty`);
  }

  return normalized;
}

type BinanceMarketOrderPayload = {
  symbol: string;
  side: BinanceOrderSide;
  type: 'MARKET';
  newOrderRespType: 'FULL';
  newClientOrderId?: string;
} & (
  | {
      quantity: string;
    }
  | {
      quoteOrderQty: string;
    }
);

function buildMarketOrderPayload(input: BinanceMarketOrderRequest): BinanceMarketOrderPayload;
function buildMarketOrderPayload(input: BinanceMarketOrderByQuoteAmountRequest): BinanceMarketOrderPayload;
function buildMarketOrderPayload(
  input: BinanceMarketOrderRequest | BinanceMarketOrderByQuoteAmountRequest,
): BinanceMarketOrderPayload {
  const symbol = normalizeTickerSymbol(input.symbol);
  const side = normalizeOrderSide(input.side);
  const newClientOrderId = normalizeBinanceClientOrderId(
    input.newClientOrderId,
    'Binance newClientOrderId',
  );

  if ('quantity' in input) {
    return {
      symbol,
      side,
      type: 'MARKET',
      quantity: normalizePositiveDecimalString(input.quantity, 'Binance market order quantity'),
      newOrderRespType: 'FULL',
      newClientOrderId,
    };
  }

  return {
    symbol,
    side,
    type: 'MARKET',
    /**
     * Binance supports MARKET orders by quote notional through `quoteOrderQty`.
     * This is useful for BUY/SELL flows driven by the exact amount received in the quote asset.
     */
    quoteOrderQty: normalizePositiveDecimalString(
      input.quoteOrderQty,
      'Binance market order quoteOrderQty',
    ),
    newOrderRespType: 'FULL',
    newClientOrderId,
  };
}

/** Public market-data helper for Binance ticker/price queries. */
export async function getTickerPrice(
  symbol: string,
  client: BinanceClient = createBinanceClient(),
): Promise<BinanceTickerPrice> {
  const normalizedSymbol = normalizeTickerSymbol(symbol);
  return client.publicGet<BinanceTickerPrice>('/api/v3/ticker/price', { symbol: normalizedSymbol });
}

export async function placeMarketOrder(
  order: BinanceMarketOrderRequest,
  client: BinanceClient = createBinanceClient(),
): Promise<BinanceMarketOrderResponse> {
  return client.signedPost<BinanceMarketOrderResponse>('/api/v3/order', buildMarketOrderPayload(order));
}

/**
 * Places a spot MARKET order by quote-asset notional via Binance `quoteOrderQty`.
 * Common use case: spend the exact fiat amount received and let Binance determine the base quantity filled.
 * This mode is restricted here to MARKET orders and remains subject to Binance symbol/order filters.
 */
export async function placeMarketOrderByQuoteAmount(
  order: BinanceMarketOrderByQuoteAmountRequest,
  client: BinanceClient = createBinanceClient(),
): Promise<BinanceMarketOrderResponse> {
  return client.signedPost<BinanceMarketOrderResponse>('/api/v3/order', buildMarketOrderPayload(order));
}

export { buildMarketOrderPayload };
