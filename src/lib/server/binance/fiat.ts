import '@/lib/server/only';

import { createBinanceClient, type BinanceClient } from './client';
import { BinanceRequestError, BinanceValidationError } from './errors';
import type {
  BinanceFiatApiResponse,
  BinanceFiatDepositData,
  BinanceFiatDepositRequest,
  BinanceFiatOrderDetail,
  BinanceFiatOrdersData,
  BinanceFiatOrdersQuery,
} from './types';

const FIAT_SUCCESS_CODE = '000000';

function resolveClient(client?: BinanceClient): BinanceClient {
  return client ?? createBinanceClient();
}

function normalizeRequiredString(value: string | undefined, fieldName: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new BinanceValidationError(`${fieldName} is required`);
  }
  return normalized;
}

/** Parses a positive fiat amount for Binance fiat deposit body (JSON number). */
export function normalizeFiatDepositAmount(amount: number | string): number {
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BinanceValidationError('Binance fiat deposit amount must be a positive number');
    }
    return amount;
  }

  const normalized = amount.trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new BinanceValidationError('Binance fiat deposit amount must be a positive decimal string');
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new BinanceValidationError('Binance fiat deposit amount must be a positive number');
  }
  return parsed;
}

export function buildFiatDepositBody(input: BinanceFiatDepositRequest): Record<string, unknown> {
  const currency = (input.currency ?? 'BRL').toUpperCase();
  if (currency !== 'BRL') {
    throw new BinanceValidationError('Binance fiat deposit currently supports currency BRL only');
  }

  const apiPaymentMethod = input.apiPaymentMethod ?? 'Pix';
  if (apiPaymentMethod !== 'Pix') {
    throw new BinanceValidationError('Binance fiat deposit currently supports apiPaymentMethod Pix only');
  }

  const body: Record<string, unknown> = {
    currency,
    apiPaymentMethod,
    amount: normalizeFiatDepositAmount(input.amount),
  };

  if (input.ext && Object.keys(input.ext).length > 0) {
    body.ext = input.ext;
  }

  return body;
}

/** Unwraps Binance fiat envelope; throws when business `code` is not success. */
export function unwrapFiatApiResponse<T>(payload: BinanceFiatApiResponse<T>): T {
  if (String(payload.code) !== FIAT_SUCCESS_CODE) {
    throw new BinanceRequestError(
      200,
      payload.code,
      payload.message?.trim() || `Binance fiat API error (code ${payload.code})`,
      payload,
    );
  }
  return payload.data;
}

/**
 * Creates a BRL fiat deposit order via PIX.
 * Caller must complete the bank transfer using PIX details from order detail (when present).
 * Weight: UID 45000 — use sparingly.
 */
export async function createFiatDeposit(
  input: BinanceFiatDepositRequest,
  client?: BinanceClient,
): Promise<BinanceFiatDepositData> {
  const resolved = resolveClient(client);
  const body = buildFiatDepositBody(input);
  const query = input.recvWindow != null ? { recvWindow: input.recvWindow } : {};

  const response = await resolved.signedPostJson<BinanceFiatApiResponse<BinanceFiatDepositData>>(
    '/sapi/v1/fiat/deposit',
    body,
    query,
  );

  const data = unwrapFiatApiResponse(response);
  if (!data || typeof data !== 'object') {
    throw new BinanceRequestError(200, null, 'Binance fiat deposit returned empty data', response);
  }

  const orderId =
    typeof data.orderId === 'string' && data.orderId.trim()
      ? data.orderId.trim()
      : typeof (data as Record<string, unknown>).orderNo === 'string'
        ? String((data as Record<string, unknown>).orderNo).trim()
        : '';

  if (!orderId) {
    throw new BinanceRequestError(
      200,
      null,
      'Binance fiat deposit response missing orderId',
      response,
    );
  }

  return { ...data, orderId };
}

/** Fetches fiat order detail — primary smoke probe for PIX/EMV fields. */
export async function getFiatOrderDetail(
  orderNo: string,
  client?: BinanceClient,
  recvWindow?: number,
): Promise<BinanceFiatOrderDetail> {
  const resolved = resolveClient(client);
  const normalizedOrderNo = normalizeRequiredString(orderNo, 'orderNo');

  const response = await resolved.signedGet<
    BinanceFiatApiResponse<BinanceFiatOrderDetail> | BinanceFiatOrderDetail
  >('/sapi/v1/fiat/get-order-detail', {
    orderNo: normalizedOrderNo,
    ...(recvWindow != null ? { recvWindow } : {}),
  });

  if (response && typeof response === 'object' && 'code' in response && 'data' in response) {
    return unwrapFiatApiResponse(response as BinanceFiatApiResponse<BinanceFiatOrderDetail>);
  }

  return response as BinanceFiatOrderDetail;
}

/** Lists fiat deposit/withdraw history. `transactionType`: 0 deposit, 1 withdraw. */
export async function getFiatOrders(
  query: BinanceFiatOrdersQuery,
  client?: BinanceClient,
): Promise<BinanceFiatOrdersData> {
  const resolved = resolveClient(client);

  if (query.transactionType !== 0 && query.transactionType !== 1) {
    throw new BinanceValidationError('transactionType must be 0 (deposit) or 1 (withdraw)');
  }

  const response = await resolved.signedGet<
    BinanceFiatApiResponse<BinanceFiatOrdersData> | BinanceFiatOrdersData
  >('/sapi/v1/fiat/orders', {
    transactionType: query.transactionType,
    beginTime: query.beginTime,
    endTime: query.endTime,
    page: query.page,
    rows: query.rows,
    recvWindow: query.recvWindow,
  });

  if (response && typeof response === 'object' && 'code' in response && 'data' in response) {
    return unwrapFiatApiResponse(response as BinanceFiatApiResponse<BinanceFiatOrdersData>);
  }

  return response as BinanceFiatOrdersData;
}
