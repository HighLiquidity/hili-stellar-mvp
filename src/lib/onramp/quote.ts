import '@/lib/server/only';

import { isDepositAboveMax, loadMaxDepositBrl, parseMaxDepositBrl } from '@/lib/admin-test-settings/deposit-limits';
import { brlStringToJsonNumber } from '@/lib/corpx/pix/brl';
import { binance } from '@/lib/server/binance';
import { assertBinanceMarketQuoteNotionalForSymbol } from '@/lib/server/binance/exchange-info';
import { truncateUtf8Bytes } from '@/lib/ramp/memo';

import { OnrampConfigError, OnrampOperationError, OnrampValidationError } from './errors';
import { createQuotedOnrampOrder, type OnrampOrderRow } from './order-store';
import {
  DEFAULT_ONRAMP_QUOTE_TTL_SECONDS,
  getOnrampQuoteTtlSeconds,
} from './ttl';

export const DEFAULT_ONRAMP_QUOTE_SYMBOL = 'USDCBRL';
export { DEFAULT_ONRAMP_QUOTE_TTL_SECONDS };
export const DEFAULT_ONRAMP_QUOTE_SPREAD_BPS = 0;

const INTERNAL_DECIMAL_SCALE = BigInt(18);
const USDC_DECIMALS = BigInt(7);
const BRL_DECIMALS = BigInt(2);
const RATE_DECIMALS = BigInt(8);
const POSITIVE_DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;
const BRL_AMOUNT_PATTERN = /^\d+(?:\.\d{1,2})?$/;
const USDC_AMOUNT_PATTERN = /^\d+(?:\.\d{1,7})?$/;
const STELLAR_ACCOUNT_PATTERN = /^G[A-Z2-7]{55}$/;
/** Stellar text memo limit (UTF-8 bytes) for on-chain payouts. */
const STELLAR_TEXT_MEMO_MAX_BYTES = 28;

const ZERO_BIGINT = BigInt(0);
const TWO_BIGINT = BigInt(2);
const TEN = BigInt(10);
const FIVE_THOUSAND = BigInt(5_000);
const TEN_THOUSAND = BigInt(10_000);

export type OnrampQuoteBasis = 'brl' | 'usdc';

export type CreateOnrampQuoteInput = {
  taxId: string;
  amountBrl?: string;
  amountUsdc?: string;
  destinationAddress: string;
  destinationMemo?: string | null;
  actorEmail?: string | null;
  actorUserId?: string | null;
};

export type OnrampQuoteView = {
  symbol: string;
  side: 'BUY' | 'SELL';
  amountBrl: string;
  amountUsdc: string;
  rate: string;
  expiresAt: string;
};

export type OnrampQuoteResponse = {
  orderId: string;
  status: 'quoted';
  quote: OnrampQuoteView;
  destination: {
    address: string;
    memo: string | null;
  };
};

function pow10(scale: bigint): bigint {
  return TEN ** scale;
}

function decimalToScaledInteger(value: string, scale: bigint, fieldName: string): bigint {
  const normalized = value.trim();
  if (!POSITIVE_DECIMAL_PATTERN.test(normalized)) {
    throw new OnrampValidationError(`${fieldName} must be a positive decimal string.`);
  }

  const [wholePart, fractionPart = ''] = normalized.split('.');
  if (BigInt(fractionPart.length) > scale) {
    throw new OnrampValidationError(`${fieldName} has too many decimal places.`);
  }

  const paddedFraction = fractionPart.padEnd(Number(scale), '0');
  return BigInt(`${wholePart}${paddedFraction}`);
}

function formatScaledInteger(
  value: bigint,
  scale: bigint,
  options?: { minFractionDigits?: number; maxFractionDigits?: number },
): string {
  const negative = value < 0;
  const absolute = negative ? -value : value;
  const factor = pow10(scale);
  const whole = absolute / factor;
  const fraction = absolute % factor;
  const rawFraction = scale === ZERO_BIGINT ? '' : fraction.toString().padStart(Number(scale), '0');
  const minFractionDigits = options?.minFractionDigits ?? 0;
  const maxFractionDigits = options?.maxFractionDigits ?? Number(scale);
  const slicedFraction = rawFraction.slice(0, maxFractionDigits);
  const trimmedFraction = slicedFraction.replace(/0+$/, '');
  const finalFraction = trimmedFraction.length >= minFractionDigits ? trimmedFraction : rawFraction.slice(0, minFractionDigits);

  if (!finalFraction) {
    return `${negative ? '-' : ''}${whole.toString()}`;
  }

  return `${negative ? '-' : ''}${whole.toString()}.${finalFraction}`;
}

function divideScaledIntegers(dividend: bigint, divisor: bigint, outputScale: bigint): bigint {
  if (divisor <= ZERO_BIGINT) {
    throw new OnrampValidationError('Quote rate must be greater than zero.');
  }

  const scaledDividend = dividend * pow10(outputScale);
  return (scaledDividend + divisor / TWO_BIGINT) / divisor;
}

function multiplyScaledToOutputScale(
  left: bigint,
  leftScale: bigint,
  right: bigint,
  rightScale: bigint,
  outputScale: bigint,
): bigint {
  const product = left * right;
  const excessScale = leftScale + rightScale - outputScale;
  if (excessScale <= ZERO_BIGINT) {
    return product * pow10(-excessScale);
  }

  const divisor = pow10(excessScale);
  return (product + divisor / TWO_BIGINT) / divisor;
}

function readNonNegativeIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  if (!/^\d+$/.test(raw)) {
    throw new OnrampConfigError(`${name} must be a non-negative integer.`);
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new OnrampConfigError(`${name} must be a non-negative integer.`);
  }

  return parsed;
}

function getOnrampQuoteSymbol(): string {
  return process.env.ONRAMP_QUOTE_SYMBOL?.trim().toUpperCase() || DEFAULT_ONRAMP_QUOTE_SYMBOL;
}

function getOnrampQuoteSpreadBps(): number {
  return readNonNegativeIntegerEnv('ONRAMP_QUOTE_SPREAD_BPS', DEFAULT_ONRAMP_QUOTE_SPREAD_BPS);
}

export function normalizeOnrampTaxId(taxId: string): string {
  const digits = taxId.replace(/\D/g, '');
  if (!digits) {
    throw new OnrampValidationError('taxId is required.');
  }

  if (digits.length !== 11 && digits.length !== 14) {
    throw new OnrampValidationError('taxId must be a valid CPF or CNPJ.');
  }

  return digits;
}

export function normalizeOnrampAmountBrl(amountBrl: string): string {
  const normalized = amountBrl.trim().replace(',', '.');
  if (!BRL_AMOUNT_PATTERN.test(normalized)) {
    throw new OnrampValidationError('amountBrl must be a positive BRL amount with up to 2 decimals.');
  }

  const numericAmount = brlStringToJsonNumber(normalized);
  if (numericAmount <= 0) {
    throw new OnrampValidationError('amountBrl must be greater than zero.');
  }

  return numericAmount.toFixed(2);
}

export function normalizeOnrampAmountUsdc(amountUsdc: string): string {
  const normalized = amountUsdc.trim().replace(',', '.');
  if (!USDC_AMOUNT_PATTERN.test(normalized)) {
    throw new OnrampValidationError('amountUsdc must be a positive USDC amount with up to 7 decimals.');
  }

  const numericAmount = decimalToScaledInteger(normalized, USDC_DECIMALS, 'amountUsdc');
  if (numericAmount <= ZERO_BIGINT) {
    throw new OnrampValidationError('amountUsdc must be greater than zero.');
  }

  return formatScaledInteger(numericAmount, USDC_DECIMALS, {
    minFractionDigits: 2,
    maxFractionDigits: Number(USDC_DECIMALS),
  });
}

function resolveQuoteAmountInput(input: CreateOnrampQuoteInput): {
  quoteBasis: OnrampQuoteBasis;
  amountBrl?: string;
  amountUsdc?: string;
} {
  const hasBrl = typeof input.amountBrl === 'string' && input.amountBrl.trim().length > 0;
  const hasUsdc = typeof input.amountUsdc === 'string' && input.amountUsdc.trim().length > 0;

  if (hasBrl && hasUsdc) {
    throw new OnrampValidationError('Provide either amountBrl or amountUsdc, not both.');
  }

  if (!hasBrl && !hasUsdc) {
    throw new OnrampValidationError('amountBrl or amountUsdc is required.');
  }

  if (hasUsdc) {
    return { quoteBasis: 'usdc', amountUsdc: input.amountUsdc };
  }

  return { quoteBasis: 'brl', amountBrl: input.amountBrl };
}

export function normalizeOnrampDestinationAddress(destinationAddress: string): string {
  const normalized = destinationAddress.trim().toUpperCase();
  if (!normalized) {
    throw new OnrampValidationError('destinationAddress is required.');
  }

  if (!STELLAR_ACCOUNT_PATTERN.test(normalized)) {
    throw new OnrampValidationError('destinationAddress must be a valid Stellar public key.');
  }

  return normalized;
}

export function normalizeOnrampDestinationMemo(destinationMemo?: string | null): string | null {
  if (destinationMemo == null) {
    return null;
  }

  const normalized = destinationMemo.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length > 128) {
    throw new OnrampValidationError('destinationMemo must be 128 characters or less.');
  }

  return truncateUtf8Bytes(normalized, STELLAR_TEXT_MEMO_MAX_BYTES);
}

export function applyOnrampQuoteSpread(rateBrlPerUsdc: string, spreadBps: number): string {
  const normalizedSpreadBps = Number.isFinite(spreadBps) ? Math.trunc(spreadBps) : Number.NaN;
  if (!Number.isFinite(normalizedSpreadBps) || normalizedSpreadBps < 0) {
    throw new OnrampValidationError('quote spread bps must be a non-negative integer.');
  }

  const baseRate = decimalToScaledInteger(rateBrlPerUsdc, INTERNAL_DECIMAL_SCALE, 'quote rate');
  if (baseRate <= ZERO_BIGINT) {
    throw new OnrampValidationError('quote rate must be greater than zero.');
  }

  const adjustedRate = (baseRate * BigInt(10_000 + normalizedSpreadBps) + FIVE_THOUSAND) / TEN_THOUSAND;

  return formatScaledInteger(adjustedRate, INTERNAL_DECIMAL_SCALE, {
    minFractionDigits: 2,
    maxFractionDigits: Number(RATE_DECIMALS),
  });
}

export function calculateQuotedUsdcAmount(amountBrl: string, effectiveRateBrlPerUsdc: string): string {
  const amount = decimalToScaledInteger(amountBrl, INTERNAL_DECIMAL_SCALE, 'amountBrl');
  const rate = decimalToScaledInteger(effectiveRateBrlPerUsdc, INTERNAL_DECIMAL_SCALE, 'quote rate');

  if (amount <= ZERO_BIGINT) {
    throw new OnrampValidationError('amountBrl must be greater than zero.');
  }

  const quotedUsdc = divideScaledIntegers(amount, rate, USDC_DECIMALS);
  return formatScaledInteger(quotedUsdc, USDC_DECIMALS, {
    minFractionDigits: 2,
    maxFractionDigits: Number(USDC_DECIMALS),
  });
}

export function calculateQuotedBrlAmount(amountUsdc: string, effectiveRateBrlPerUsdc: string): string {
  const amount = decimalToScaledInteger(amountUsdc, USDC_DECIMALS, 'amountUsdc');
  const rate = decimalToScaledInteger(effectiveRateBrlPerUsdc, INTERNAL_DECIMAL_SCALE, 'quote rate');

  if (amount <= ZERO_BIGINT) {
    throw new OnrampValidationError('amountUsdc must be greater than zero.');
  }

  const quotedBrl = multiplyScaledToOutputScale(amount, USDC_DECIMALS, rate, INTERNAL_DECIMAL_SCALE, BRL_DECIMALS);
  return formatScaledInteger(quotedBrl, BRL_DECIMALS, {
    minFractionDigits: 2,
    maxFractionDigits: Number(BRL_DECIMALS),
  });
}

export function buildOnrampQuoteResponse(row: OnrampOrderRow): OnrampQuoteResponse {
  return {
    orderId: row.id,
    status: 'quoted',
    quote: {
      symbol: row.quote_symbol,
      side: row.quote_side,
      amountBrl: row.amount_brl,
      amountUsdc: row.amount_usdc,
      rate: row.quote_rate ?? '',
      expiresAt: row.quote_expires_at,
    },
    destination: {
      address: row.destination_address,
      memo: row.destination_memo,
    },
  };
}

function assertWithinConfiguredDepositLimit(amountBrl: string, maxDepositBrl: string): void {
  const amount = brlStringToJsonNumber(amountBrl);
  const maxDeposit = parseMaxDepositBrl(maxDepositBrl);
  if (maxDeposit == null) {
    throw new OnrampConfigError('Configured max deposit value is invalid.');
  }

  if (isDepositAboveMax(amount, maxDeposit)) {
    throw new OnrampValidationError(`amountBrl exceeds the configured deposit limit of ${maxDepositBrl}.`);
  }
}

export async function createOnrampQuote(input: CreateOnrampQuoteInput): Promise<OnrampQuoteResponse> {
  const resolved = resolveQuoteAmountInput(input);
  const taxId = normalizeOnrampTaxId(input.taxId);
  const destinationAddress = normalizeOnrampDestinationAddress(input.destinationAddress);
  const destinationMemo = normalizeOnrampDestinationMemo(input.destinationMemo);

  const maxDepositResult = await loadMaxDepositBrl();
  if (!maxDepositResult.ok) {
    throw new OnrampConfigError(maxDepositResult.reason);
  }

  const symbol = getOnrampQuoteSymbol();
  const spreadBps = getOnrampQuoteSpreadBps();
  const ttlSeconds = getOnrampQuoteTtlSeconds();
  const ticker = await binance.market.getTickerPrice(symbol);
  const effectiveRate = applyOnrampQuoteSpread(ticker.price, spreadBps);

  let amountBrl: string;
  let amountUsdc: string;
  if (resolved.quoteBasis === 'brl') {
    amountBrl = normalizeOnrampAmountBrl(resolved.amountBrl!);
    amountUsdc = calculateQuotedUsdcAmount(amountBrl, effectiveRate);
  } else {
    amountUsdc = normalizeOnrampAmountUsdc(resolved.amountUsdc!);
    amountBrl = calculateQuotedBrlAmount(amountUsdc, effectiveRate);
  }

  assertWithinConfiguredDepositLimit(amountBrl, maxDepositResult.maxDepositBrl);

  try {
    await assertBinanceMarketQuoteNotionalForSymbol(symbol, amountBrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new OnrampValidationError(message);
  }

  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  const created = await createQuotedOnrampOrder({
    taxId,
    amountBrl,
    amountUsdc,
    destinationAddress,
    destinationMemo,
    quoteSymbol: symbol,
    quoteSide: 'BUY',
    quoteExpiresAt: expiresAt,
    quoteRate: effectiveRate,
    quoteSource: 'binance:api/v3/ticker/price',
    quoteSpreadBps: spreadBps,
    createdByEmail: input.actorEmail ?? null,
    createdByUserId: input.actorUserId ?? null,
    metadata: {
      quote: {
        tickerSymbol: ticker.symbol,
        tickerPrice: ticker.price,
        effectiveRate,
        spreadBps,
        ttlSeconds,
        quoteBasis: resolved.quoteBasis,
      },
      reservation: {
        mode: 'logical_order_row',
      },
    },
  });

  if (!created.ok) {
    console.error('[onramp/quote] failed to persist quoted order', {
      reason: created.reason,
      symbol,
    });
    throw new OnrampOperationError('Failed to persist on-ramp quote.');
  }

  return buildOnrampQuoteResponse(created.row);
}
