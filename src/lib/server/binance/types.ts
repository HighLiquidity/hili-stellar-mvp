import '@/lib/server/only';

/** Basic ticker response from Binance market data endpoints. */
export type BinanceTickerPrice = {
  symbol: string;
  price: string;
};

/** Normalized result used by Binance health checks in server-side flows. */
export type BinancePingResult = {
  ok: true;
};

/** Balance entry returned by signed account endpoints. */
export type BinanceAccountBalance = {
  asset: string;
  free: string;
  locked: string;
};

/** Clean account shape consumed internally by server-side services. */
export type BinanceAccountInfo = {
  makerCommission: number;
  takerCommission: number;
  buyerCommission: number;
  sellerCommission: number;
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  updateTime: number;
  accountType: string;
  balances: BinanceAccountBalance[];
  permissions?: string[];
  uid?: number;
};

/** Reduced balance view after filtering out zero-only assets. */
export type BinanceNonZeroBalance = BinanceAccountBalance;

export type BinanceOrderSide = 'BUY' | 'SELL';
export type BinanceOrderType = 'MARKET';
export type BinanceOrderStatus = string;
export type BinanceWalletType = 0 | 1;

/** Input for a spot market order using base-asset quantity. */
export type BinanceMarketOrderRequest = {
  symbol: string;
  side: BinanceOrderSide;
  quantity: string;
  newClientOrderId?: string;
};

/**
 * Input for a spot market order using quote-asset notional.
 * Binance supports this through `quoteOrderQty` on MARKET orders.
 */
export type BinanceMarketOrderByQuoteAmountRequest = {
  symbol: string;
  side: BinanceOrderSide;
  quoteOrderQty: string;
  newClientOrderId?: string;
};

/** Fill lines returned by Binance for executed market orders. */
export type BinanceOrderFill = {
  price: string;
  qty: string;
  commission: string;
  commissionAsset: string;
  tradeId: number;
};

/** Query input for GET /api/v3/order. */
export type BinanceGetSpotOrderRequest = {
  symbol: string;
  orderId?: string;
  origClientOrderId?: string;
};

/** Relevant Binance response fields for spot market-order execution. */
export type BinanceMarketOrderResponse = {
  symbol: string;
  orderId: number;
  clientOrderId: string;
  transactTime: number;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: BinanceOrderStatus;
  type: BinanceOrderType;
  side: BinanceOrderSide;
  fills?: BinanceOrderFill[];
};

/** Coin-level capital config returned by Binance wallet `/sapi` endpoints. */
export type BinanceCoinNetworkConfig = {
  network: string;
  coin: string;
  name: string;
  isDefault: boolean;
  depositEnable: boolean;
  withdrawEnable: boolean;
  withdrawTag: boolean;
  busy: boolean;
  addressRegex: string;
  memoRegex: string;
  withdrawFee: string;
  withdrawMin: string;
  withdrawMax: string;
  withdrawInternalMin?: string;
  estimatedArrivalTime?: number;
  specialTips?: string;
  specialWithdrawTips?: string;
  contractAddress?: string;
  contractAddressUrl?: string;
  denomination?: number;
};

export type BinanceCoinConfig = {
  coin: string;
  name: string;
  depositAllEnable: boolean;
  withdrawAllEnable: boolean;
  free: string;
  locked: string;
  freeze: string;
  withdrawing: string;
  ipoing: string;
  ipoable: string;
  storage: string;
  isLegalMoney: boolean;
  trading: boolean;
  networkList: BinanceCoinNetworkConfig[];
};

/** Request accepted by the internal Binance withdraw service. */
export type BinanceCryptoWithdrawRequest = {
  coin: string;
  address: string;
  amount: string;
  /**
   * Required by this wrapper even though Binance allows omitting it.
   * This avoids accidentally withdrawing on the exchange default network.
   */
  network: string;
  addressTag?: string;
  name?: string;
  withdrawOrderId?: string;
  transactionFeeFlag?: boolean;
  walletType?: BinanceWalletType;
  recvWindow?: number;
};

/** Official Binance withdraw apply response. */
export type BinanceCryptoWithdrawResponse = {
  id: string;
};

export type BinanceWithdrawStatusCode = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type BinanceWithdrawHistoryQuery = {
  coin?: string;
  withdrawOrderId?: string;
  status?: BinanceWithdrawStatusCode;
  offset?: number;
  limit?: number;
  idList?: string[];
  startTime?: number;
  endTime?: number;
  recvWindow?: number;
};

/** Relevant fields returned by Binance withdraw history. */
export type BinanceWithdrawRecord = {
  id: string;
  amount: string;
  transactionFee: string;
  coin: string;
  status: BinanceWithdrawStatusCode;
  address: string;
  txId?: string;
  applyTime: string;
  network?: string;
  transferType?: number;
  withdrawOrderId?: string;
  info?: string;
  confirmNo?: number;
  walletType?: BinanceWalletType;
  txKey?: string;
  completeTime?: string;
};

/** Envelope used by Binance fiat SAPI endpoints (`code` / `message` / `data`). */
export type BinanceFiatApiResponse<T = unknown> = {
  code: string | number;
  message?: string | null;
  data: T;
};

export type BinanceFiatPaymentMethod = 'Pix';

export type BinanceFiatDepositRequest = {
  currency?: 'BRL';
  apiPaymentMethod?: BinanceFiatPaymentMethod;
  /** Fiat amount in major units (e.g. 30 = R$30). */
  amount: number | string;
  ext?: Record<string, unknown>;
  recvWindow?: number;
};

export type BinanceFiatDepositData = {
  orderId: string;
  [key: string]: unknown;
};

/**
 * Order detail payload is intentionally permissive so smoke tests can inspect
 * real PIX/EMV fields returned by Binance (shape not fully documented).
 */
export type BinanceFiatOrderDetail = {
  orderNo?: string;
  orderId?: string;
  [key: string]: unknown;
};

export type BinanceFiatOrdersQuery = {
  /** 0 = deposit, 1 = withdraw (Binance fiat orders). */
  transactionType: 0 | 1;
  beginTime?: number;
  endTime?: number;
  page?: number;
  rows?: number;
  recvWindow?: number;
};

export type BinanceFiatOrdersData = {
  data?: unknown[];
  total?: number;
  [key: string]: unknown;
};
