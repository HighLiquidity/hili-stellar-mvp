import '@/lib/server/only';

import { BinanceValidationError } from './errors';

/** Binance `newClientOrderId` / `withdrawOrderId` legal charset and length. */
export const BINANCE_CLIENT_ORDER_ID_PATTERN = /^[a-zA-Z0-9-_]{1,36}$/;
export const BINANCE_CLIENT_ORDER_ID_MAX_LENGTH = 36;

export function isBinanceClientOrderId(value: string): boolean {
  return BINANCE_CLIENT_ORDER_ID_PATTERN.test(value.trim());
}

/**
 * Builds a deterministic Binance client order id from an internal order id.
 * Strips illegal characters and enforces max length (UUID hex fits with short prefixes).
 */
export function buildBinanceClientOrderId(prefix: string, orderId: string): string {
  const normalizedPrefix = prefix.trim();
  if (!normalizedPrefix || !/^[a-zA-Z0-9-_]+$/.test(normalizedPrefix)) {
    throw new BinanceValidationError('Binance client order id prefix must be alphanumeric, "_" or "-"');
  }

  const maxCoreLength = BINANCE_CLIENT_ORDER_ID_MAX_LENGTH - normalizedPrefix.length;
  if (maxCoreLength < 1) {
    throw new BinanceValidationError('Binance client order id prefix is too long');
  }

  const core = orderId
    .trim()
    .replace(/-/g, '')
    .replace(/[^a-zA-Z0-9]/g, '');

  if (!core) {
    throw new BinanceValidationError('order id is required to build a Binance client order id');
  }

  const id = `${normalizedPrefix}${core}`.slice(0, BINANCE_CLIENT_ORDER_ID_MAX_LENGTH);
  if (!isBinanceClientOrderId(id)) {
    throw new BinanceValidationError(
      `Generated Binance client order id is invalid: ${id}`,
    );
  }

  return id;
}

export function buildOnrampBinanceClientOrderId(orderId: string): string {
  return buildBinanceClientOrderId('orf_', orderId);
}

export function buildOnrampBinanceWithdrawOrderId(orderId: string): string {
  return buildBinanceClientOrderId('orw_', orderId);
}

export function buildOfframpBinanceClientOrderId(orderId: string): string {
  return buildBinanceClientOrderId('off_', orderId);
}

export function normalizeBinanceClientOrderId(
  value: string | undefined,
  fieldName: string,
): string | undefined {
  if (value === undefined) return undefined;

  const normalized = value.trim();
  if (!normalized) {
    throw new BinanceValidationError(`${fieldName} must not be empty`);
  }

  if (!isBinanceClientOrderId(normalized)) {
    throw new BinanceValidationError(
      `${fieldName} must match ${BINANCE_CLIENT_ORDER_ID_PATTERN.source}`,
    );
  }

  return normalized;
}
