import '@/lib/server/only';

import { BinanceClient, createBinanceClient } from './client';
import { BinanceValidationError } from './errors';
import type {
  BinanceCoinConfig,
  BinanceCoinNetworkConfig,
  BinanceCryptoWithdrawRequest,
  BinanceCryptoWithdrawResponse,
  BinanceWalletType,
  BinanceWithdrawHistoryQuery,
  BinanceWithdrawRecord,
} from './types';

function normalizeRequiredString(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new BinanceValidationError(`${fieldName} is required`);
  }

  return normalized;
}

function normalizeCoin(value: string): string {
  return normalizeRequiredString(value, 'Binance withdraw coin').toUpperCase();
}

function normalizeNetwork(value: string): string {
  return normalizeRequiredString(value, 'Binance withdraw network').toUpperCase();
}

function normalizeAddress(value: string): string {
  return normalizeRequiredString(value, 'Binance withdraw address');
}

function normalizePositiveDecimalString(value: string, fieldName: string): string {
  const normalized = normalizeRequiredString(value, fieldName);

  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new BinanceValidationError(`${fieldName} must be a positive decimal string`);
  }

  if (!/[1-9]/.test(normalized)) {
    throw new BinanceValidationError(`${fieldName} must be greater than zero`);
  }

  return normalized;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeWalletType(value: BinanceWalletType | undefined): BinanceWalletType | undefined {
  if (value === undefined) return undefined;
  if (value !== 0 && value !== 1) {
    throw new BinanceValidationError('Binance walletType must be 0 (spot) or 1 (funding)');
  }

  return value;
}

function normalizeHistoryLimit(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value <= 0 || value > 1000) {
    throw new BinanceValidationError('Binance withdraw history limit must be an integer between 1 and 1000');
  }

  return value;
}

function normalizeHistoryOffset(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0) {
    throw new BinanceValidationError('Binance withdraw history offset must be a non-negative integer');
  }

  return value;
}

export function selectCoinConfig(
  coinConfigs: BinanceCoinConfig[],
  coin: string,
): BinanceCoinConfig {
  const normalizedCoin = normalizeCoin(coin);
  const match = coinConfigs.find((entry) => entry.coin.toUpperCase() === normalizedCoin);

  if (!match) {
    throw new BinanceValidationError(`Binance coin ${normalizedCoin} is not available in capital config`);
  }

  return match;
}

export function selectCoinNetworkConfig(
  coinConfig: BinanceCoinConfig,
  network: string,
): BinanceCoinNetworkConfig {
  const normalizedNetwork = normalizeNetwork(network);
  const match = coinConfig.networkList.find((entry) => entry.network.toUpperCase() === normalizedNetwork);

  if (!match) {
    throw new BinanceValidationError(
      `Binance network ${normalizedNetwork} is not available for coin ${coinConfig.coin}`,
    );
  }

  return match;
}

export function filterWithdrawEnabledNetworks(
  networks: BinanceCoinNetworkConfig[],
): BinanceCoinNetworkConfig[] {
  return networks.filter((network) => network.withdrawEnable);
}

type BinanceCryptoWithdrawPayload = {
  coin: string;
  address: string;
  amount: string;
  network: string;
  addressTag?: string;
  name?: string;
  withdrawOrderId?: string;
  transactionFeeFlag?: boolean;
  walletType?: BinanceWalletType;
  recvWindow?: number;
};

export function buildCryptoWithdrawPayload(
  input: BinanceCryptoWithdrawRequest,
  networkConfig?: BinanceCoinNetworkConfig,
): BinanceCryptoWithdrawPayload {
  const coin = normalizeCoin(input.coin);
  const address = normalizeAddress(input.address);
  const amount = normalizePositiveDecimalString(input.amount, 'Binance withdraw amount');
  const network = normalizeNetwork(input.network);
  const addressTag = normalizeOptionalString(input.addressTag);
  const name = normalizeOptionalString(input.name);
  const withdrawOrderId = normalizeOptionalString(input.withdrawOrderId);
  const walletType = normalizeWalletType(input.walletType);

  if (networkConfig) {
    if (!networkConfig.withdrawEnable) {
      throw new BinanceValidationError(`Binance withdraw is disabled for ${coin} on network ${network}`);
    }

    if (networkConfig.withdrawTag && !addressTag) {
      throw new BinanceValidationError(`Binance network ${network} requires addressTag/memo for ${coin}`);
    }

    if (!networkConfig.withdrawTag && addressTag) {
      throw new BinanceValidationError(
        `Binance network ${network} does not support addressTag/memo for ${coin}`,
      );
    }
  }

  return {
    coin,
    address,
    amount,
    network,
    addressTag,
    name,
    withdrawOrderId,
    transactionFeeFlag: input.transactionFeeFlag,
    walletType,
    recvWindow: input.recvWindow,
  };
}

/** Returns the full Binance capital config, including per-coin network capabilities. */
export async function getAllCoinConfigs(
  client: BinanceClient = createBinanceClient(),
): Promise<BinanceCoinConfig[]> {
  return client.signedGet<BinanceCoinConfig[]>('/sapi/v1/capital/config/getall');
}

/** Returns a single coin config from Binance capital config. */
export async function getCoinConfig(
  coin: string,
  client: BinanceClient = createBinanceClient(),
): Promise<BinanceCoinConfig> {
  const configs = await getAllCoinConfigs(client);
  return selectCoinConfig(configs, coin);
}

/** Returns the selected network config for a coin from Binance capital config. */
export async function getCoinNetworkConfig(
  coin: string,
  network: string,
  client: BinanceClient = createBinanceClient(),
): Promise<BinanceCoinNetworkConfig> {
  const coinConfig = await getCoinConfig(coin, client);
  return selectCoinNetworkConfig(coinConfig, network);
}

/** Returns withdraw-enabled networks for a coin, useful before choosing a withdraw route. */
export async function getWithdrawEnabledCoinNetworks(
  coin: string,
  client: BinanceClient = createBinanceClient(),
): Promise<BinanceCoinNetworkConfig[]> {
  const coinConfig = await getCoinConfig(coin, client);
  return filterWithdrawEnabledNetworks(coinConfig.networkList);
}

/**
 * Requests a crypto withdraw through Binance capital withdraw apply.
 * This wrapper requires `network` even though Binance allows omitting it, to avoid accidental default-network withdraws.
 */
export async function requestCryptoWithdraw(
  input: BinanceCryptoWithdrawRequest,
  client: BinanceClient = createBinanceClient(),
): Promise<BinanceCryptoWithdrawResponse> {
  const networkConfig = await getCoinNetworkConfig(input.coin, input.network, client);
  const payload = buildCryptoWithdrawPayload(input, networkConfig);

  return client.signedPost<BinanceCryptoWithdrawResponse>('/sapi/v1/capital/withdraw/apply', payload);
}

/** Fetches Binance withdraw history using the official capital history endpoint. */
export async function getWithdrawHistory(
  query: BinanceWithdrawHistoryQuery = {},
  client: BinanceClient = createBinanceClient(),
): Promise<BinanceWithdrawRecord[]> {
  return client.signedGet<BinanceWithdrawRecord[]>('/sapi/v1/capital/withdraw/history', {
    coin: query.coin ? normalizeCoin(query.coin) : undefined,
    withdrawOrderId: normalizeOptionalString(query.withdrawOrderId),
    status: query.status,
    offset: normalizeHistoryOffset(query.offset),
    limit: normalizeHistoryLimit(query.limit),
    idList: query.idList?.map((id) => normalizeRequiredString(id, 'Binance withdraw id')).join(','),
    startTime: query.startTime,
    endTime: query.endTime,
    recvWindow: query.recvWindow,
  });
}

/** Convenience lookup by Binance withdraw id using the history endpoint `idList` filter. */
export async function getWithdrawById(
  id: string,
  client: BinanceClient = createBinanceClient(),
): Promise<BinanceWithdrawRecord | null> {
  const records = await getWithdrawHistory({ idList: [id], limit: 1 }, client);
  return records[0] ?? null;
}

/** Convenience lookup by client-provided withdrawOrderId using the history endpoint. */
export async function getWithdrawByOrderId(
  withdrawOrderId: string,
  client: BinanceClient = createBinanceClient(),
): Promise<BinanceWithdrawRecord | null> {
  const records = await getWithdrawHistory(
    {
      withdrawOrderId,
      limit: 1,
    },
    client,
  );

  return records[0] ?? null;
}
