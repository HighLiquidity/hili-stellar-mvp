import '@/lib/server/only';

import {
  BINANCE_ENV_VARS,
  DEFAULT_BINANCE_BASE_URL,
  DEFAULT_BINANCE_TIMEOUT_MS,
  assertBinanceCredentials,
  binanceConfig,
  getBinanceConfig,
  getBinanceSignedConfig,
  isBinanceConfigured,
} from './config';
import {
  BinanceClient,
  buildSignedBinancePayload,
  createBinanceClient,
  parseBinanceErrorPayload,
  serializeBinanceParams,
} from './client';
import {
  BinanceConfigError,
  BinanceError,
  BinanceNotImplementedError,
  BinanceRequestError,
  BinanceValidationError,
} from './errors';
import { ping } from './health';
import { filterNonZeroBalances, getAccountInfo, getNonZeroBalances } from './account';
import {
  buildMarketOrderPayload,
  getSpotOrder,
  getTickerPrice,
  placeMarketOrder,
  placeMarketOrderByQuoteAmount,
} from './market';
import { appendBinanceSignature, signBinanceMessage, signBinanceQuery } from './signer';
import {
  buildCryptoWithdrawPayload,
  filterWithdrawEnabledNetworks,
  getAllCoinConfigs,
  getCoinConfig,
  getCoinNetworkConfig,
  getWithdrawById,
  getWithdrawByOrderId,
  getWithdrawEnabledCoinNetworks,
  getWithdrawHistory,
  requestCryptoWithdraw,
  selectCoinConfig,
  selectCoinNetworkConfig,
} from './withdraw';

/**
 * Central exports for the server-side Binance integration module.
 *
 * Current scope:
 * - public ping and ticker reads
 * - signed account reads
 * - signed spot market order execution by quantity or quote notional
 * - signed capital withdraw request/history/config reads
 *
 * Current limitations:
 * - no retry/backoff
 * - no caching
 * - no exchange-info driven symbol/lot-size validation
 * - no business-level guardrails before order placement
 * - no travel-rule `/sapi/v1/localentity/*` flows
 */
export {
  BINANCE_ENV_VARS,
  DEFAULT_BINANCE_BASE_URL,
  DEFAULT_BINANCE_TIMEOUT_MS,
  binanceConfig,
  getBinanceConfig,
  getBinanceSignedConfig,
  assertBinanceCredentials,
  isBinanceConfigured,
};
export {
  BinanceClient,
  createBinanceClient,
  serializeBinanceParams,
  buildSignedBinancePayload,
  parseBinanceErrorPayload,
};
export {
  BinanceError,
  BinanceConfigError,
  BinanceNotImplementedError,
  BinanceRequestError,
  BinanceValidationError,
};
export { signBinanceMessage, signBinanceQuery, appendBinanceSignature };
export {
  getSpotOrder,
  getTickerPrice,
  placeMarketOrder,
  placeMarketOrderByQuoteAmount,
  buildMarketOrderPayload,
};
export { getAccountInfo, getNonZeroBalances, filterNonZeroBalances };
export {
  requestCryptoWithdraw,
  getWithdrawHistory,
  getWithdrawById,
  getWithdrawByOrderId,
  getAllCoinConfigs,
  getCoinConfig,
  getCoinNetworkConfig,
  getWithdrawEnabledCoinNetworks,
  selectCoinConfig,
  selectCoinNetworkConfig,
  filterWithdrawEnabledNetworks,
  buildCryptoWithdrawPayload,
};
export { ping };

/**
 * Grouped façade for internal server-side consumers.
 * Useful in route handlers and business services that prefer a single import surface.
 */
export const binance = {
  config: {
    current: binanceConfig,
    get: getBinanceConfig,
    getSigned: getBinanceSignedConfig,
    assertCredentials: assertBinanceCredentials,
    isConfigured: isBinanceConfigured,
    defaults: {
      baseUrl: DEFAULT_BINANCE_BASE_URL,
      timeoutMs: DEFAULT_BINANCE_TIMEOUT_MS,
    },
  },
  client: {
    create: createBinanceClient,
    serializeParams: serializeBinanceParams,
    buildSignedPayload: buildSignedBinancePayload,
    parseErrorPayload: parseBinanceErrorPayload,
  },
  health: {
    ping,
  },
  market: {
    getSpotOrder,
    getTickerPrice,
    placeMarketOrder,
    placeMarketOrderByQuoteAmount,
    buildPayload: buildMarketOrderPayload,
  },
  account: {
    getAccountInfo,
    getNonZeroBalances,
    filterNonZeroBalances,
  },
  withdraw: {
    requestCryptoWithdraw,
    getWithdrawHistory,
    getWithdrawById,
    getWithdrawByOrderId,
    getAllCoinConfigs,
    getCoinConfig,
    getCoinNetworkConfig,
    getWithdrawEnabledCoinNetworks,
    selectCoinConfig,
    selectCoinNetworkConfig,
    filterWithdrawEnabledNetworks,
    buildPayload: buildCryptoWithdrawPayload,
  },
  signer: {
    signMessage: signBinanceMessage,
    signQuery: signBinanceQuery,
    appendSignature: appendBinanceSignature,
  },
} as const;

export type BinanceModule = typeof binance;
export type { BinanceConfig, BinanceSignedConfig } from './config';
export type { BinanceParsedErrorPayload, BinanceRequestParams } from './client';
export type {
  BinanceAccountBalance,
  BinanceAccountInfo,
  BinanceCoinConfig,
  BinanceCoinNetworkConfig,
  BinanceCryptoWithdrawRequest,
  BinanceCryptoWithdrawResponse,
  BinanceGetSpotOrderRequest,
  BinanceMarketOrderByQuoteAmountRequest,
  BinanceNonZeroBalance,
  BinanceMarketOrderRequest,
  BinanceMarketOrderResponse,
  BinanceOrderFill,
  BinanceOrderStatus,
  BinanceOrderSide,
  BinanceOrderType,
  BinancePingResult,
  BinanceTickerPrice,
  BinanceWalletType,
  BinanceWithdrawHistoryQuery,
  BinanceWithdrawRecord,
  BinanceWithdrawStatusCode,
} from './types';
