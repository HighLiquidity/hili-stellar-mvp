import '@/lib/server/only';

import { BinanceClient, createBinanceClient } from './client';
import { BinanceValidationError } from './errors';
import type {
  BinanceCryptoDepositAddress,
  BinanceCryptoDepositAddressRequest,
} from './types';

function normalizeRequiredString(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new BinanceValidationError(`${fieldName} is required`);
  }
  return normalized;
}

function readOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function unwrapDepositAddressPayload(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  if (record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
    return record.data as Record<string, unknown>;
  }
  return record;
}

/** Pure parser for Binance deposit-address payloads (tests + adapter). */
export function parseBinanceDepositAddressResponse(
  payload: unknown,
  coin: string,
  network: string,
): BinanceCryptoDepositAddress {
  const record = unwrapDepositAddressPayload(payload);
  const address = readOptionalString(record?.address);
  if (!address) {
    throw new BinanceValidationError(
      `Binance deposit address response missing address for ${coin} on ${network}`,
    );
  }

  const tag =
    readOptionalString(record?.tag) ??
    readOptionalString(record?.memo) ??
    readOptionalString(record?.addressTag);

  return {
    address,
    tag,
    coin: readOptionalString(record?.coin)?.toUpperCase() ?? coin,
    network: readOptionalString(record?.network)?.toUpperCase() ?? network,
    url: readOptionalString(record?.url),
  };
}

export function buildDepositAddressQuery(
  input: BinanceCryptoDepositAddressRequest,
): { coin: string; network: string } {
  return {
    coin: normalizeRequiredString(input.coin, 'Binance deposit coin').toUpperCase(),
    network: normalizeRequiredString(input.network, 'Binance deposit network').toUpperCase(),
  };
}

/**
 * Fetches the Binance wallet deposit address for a coin/network.
 * Crypto cannot be deposited via a push API — send on-chain to this address + tag.
 */
export async function getDepositAddress(
  input: BinanceCryptoDepositAddressRequest,
  client: BinanceClient = createBinanceClient(),
): Promise<BinanceCryptoDepositAddress> {
  const query = buildDepositAddressQuery(input);
  const payload = await client.signedGet<unknown>('/sapi/v1/capital/deposit/address', query);
  return parseBinanceDepositAddressResponse(payload, query.coin, query.network);
}
