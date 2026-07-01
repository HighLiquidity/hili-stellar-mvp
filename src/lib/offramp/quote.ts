import '@/lib/server/only';

import { binance } from '@/lib/server/binance';
import { assertBinanceMarketQuoteNotionalForSymbol } from '@/lib/server/binance/exchange-info';
import { normalizePixWhitelistKey, PixWhitelistValidationError } from '@/lib/pix-whitelist/normalize';
import { OFFRAMP_QUOTE_PLACEHOLDER_PIX_KEY } from '@/lib/ramp/quote-placeholders';

import type { OfframpQuoteResponse } from './contracts';
import { OfframpConfigError, OfframpOperationError, OfframpValidationError } from './errors';
import { assertAmountBrlWithinLimit } from '@/lib/commercial/limits';

import { createQuotedOfframpOrder, findOfframpOrderByIntegratorExternalId } from './order-store';

export const DEFAULT_OFFRAMP_QUOTE_SYMBOL = 'USDCBRL';
export const DEFAULT_OFFRAMP_QUOTE_TTL_SECONDS = 5 * 60;
export const DEFAULT_OFFRAMP_QUOTE_SPREAD_BPS = 0;

const INTERNAL_DECIMAL_SCALE = BigInt(18);
const USDC_DECIMALS = BigInt(7);
const BRL_DECIMALS = BigInt(2);
const RATE_DECIMALS = BigInt(8);
const POSITIVE_DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;
const USDC_AMOUNT_PATTERN = /^\d+(?:\.\d{1,7})?$/;

const ZERO_BIGINT = BigInt(0);
const TWO_BIGINT = BigInt(2);
const TEN = BigInt(10);
const FIVE_THOUSAND = BigInt(5_000);
const TEN_THOUSAND = BigInt(10_000);

export type CreateOfframpQuoteInput = {
  amountUsdc: string;
  payoutPixKey?: string;
  payoutBeneficiaryName?: string | null;
  integratorExternalId?: string | null;
  quoteSpreadBps?: number;
  apiKeyMaxAmountBrl?: string | null;
  actorEmail?: string | null;
  actorUserId?: string | null;
  actorClientId?: string | null;
};

function pow10(scale: bigint): bigint {
  return TEN ** scale;
}

function decimalToScaledInteger(value: string, scale: bigint, fieldName: string): bigint {
  const normalized = value.trim();
  if (!POSITIVE_DECIMAL_PATTERN.test(normalized)) {
    throw new OfframpValidationError(`${fieldName} must be a positive decimal string.`);
  }

  const [wholePart, fractionPart = ''] = normalized.split('.');
  if (BigInt(fractionPart.length) > scale) {
    throw new OfframpValidationError(`${fieldName} has too many decimal places.`);
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
  const finalFraction =
    trimmedFraction.length >= minFractionDigits ? trimmedFraction : rawFraction.slice(0, minFractionDigits);

  if (!finalFraction) {
    return `${negative ? '-' : ''}${whole.toString()}`;
  }

  return `${negative ? '-' : ''}${whole.toString()}.${finalFraction}`;
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
    throw new OfframpConfigError(`${name} must be a non-negative integer.`);
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new OfframpConfigError(`${name} must be a non-negative integer.`);
  }

  return parsed;
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  if (!/^\d+$/.test(raw)) {
    throw new OfframpConfigError(`${name} must be a positive integer.`);
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new OfframpConfigError(`${name} must be greater than zero.`);
  }

  return parsed;
}

function getOfframpQuoteSymbol(): string {
  return (
    process.env.OFFRAMP_QUOTE_SYMBOL?.trim().toUpperCase() ||
    process.env.ONRAMP_QUOTE_SYMBOL?.trim().toUpperCase() ||
    DEFAULT_OFFRAMP_QUOTE_SYMBOL
  );
}

export function getOfframpQuoteSpreadBps(): number {
  if (process.env.OFFRAMP_QUOTE_SPREAD_BPS?.trim()) {
    return readNonNegativeIntegerEnv('OFFRAMP_QUOTE_SPREAD_BPS', DEFAULT_OFFRAMP_QUOTE_SPREAD_BPS);
  }
  if (process.env.ONRAMP_QUOTE_SPREAD_BPS?.trim()) {
    return readNonNegativeIntegerEnv('ONRAMP_QUOTE_SPREAD_BPS', DEFAULT_OFFRAMP_QUOTE_SPREAD_BPS);
  }
  return DEFAULT_OFFRAMP_QUOTE_SPREAD_BPS;
}

function getOfframpQuoteTtlSeconds(): number {
  if (process.env.OFFRAMP_QUOTE_TTL_SECONDS?.trim()) {
    return readPositiveIntegerEnv('OFFRAMP_QUOTE_TTL_SECONDS', DEFAULT_OFFRAMP_QUOTE_TTL_SECONDS);
  }
  if (process.env.ONRAMP_QUOTE_TTL_SECONDS?.trim()) {
    return readPositiveIntegerEnv('ONRAMP_QUOTE_TTL_SECONDS', DEFAULT_OFFRAMP_QUOTE_TTL_SECONDS);
  }
  return DEFAULT_OFFRAMP_QUOTE_TTL_SECONDS;
}

export function normalizeOfframpAmountUsdc(amountUsdc: string): string {
  const normalized = amountUsdc.trim().replace(',', '.');
  if (!USDC_AMOUNT_PATTERN.test(normalized)) {
    throw new OfframpValidationError('amountUsdc must be a positive USDC amount with up to 7 decimals.');
  }

  const numericAmount = decimalToScaledInteger(normalized, USDC_DECIMALS, 'amountUsdc');
  if (numericAmount <= ZERO_BIGINT) {
    throw new OfframpValidationError('amountUsdc must be greater than zero.');
  }

  return formatScaledInteger(numericAmount, USDC_DECIMALS, {
    minFractionDigits: 2,
    maxFractionDigits: Number(USDC_DECIMALS),
  });
}

export function normalizeOfframpPayoutPixKey(payoutPixKey: string): string {
  try {
    return normalizePixWhitelistKey(payoutPixKey);
  } catch (error) {
    if (error instanceof PixWhitelistValidationError) {
      throw new OfframpValidationError('payoutPixKey is required.');
    }
    throw error;
  }
}

/** Reduces BRL-per-USDC rate for sell quotes (spread works against the seller). */
export function applyOfframpQuoteSpread(rateBrlPerUsdc: string, spreadBps: number): string {
  const normalizedSpreadBps = Number.isFinite(spreadBps) ? Math.trunc(spreadBps) : Number.NaN;
  if (!Number.isFinite(normalizedSpreadBps) || normalizedSpreadBps < 0) {
    throw new OfframpValidationError('quote spread bps must be a non-negative integer.');
  }
  if (normalizedSpreadBps > 10_000) {
    throw new OfframpValidationError('quote spread bps cannot exceed 10000.');
  }

  const baseRate = decimalToScaledInteger(rateBrlPerUsdc, INTERNAL_DECIMAL_SCALE, 'quote rate');
  if (baseRate <= ZERO_BIGINT) {
    throw new OfframpValidationError('quote rate must be greater than zero.');
  }

  const adjustedRate = (baseRate * BigInt(10_000 - normalizedSpreadBps) + FIVE_THOUSAND) / TEN_THOUSAND;

  return formatScaledInteger(adjustedRate, INTERNAL_DECIMAL_SCALE, {
    minFractionDigits: 2,
    maxFractionDigits: Number(RATE_DECIMALS),
  });
}

export function calculateQuotedBrlAmount(amountUsdc: string, effectiveRateBrlPerUsdc: string): string {
  const amount = decimalToScaledInteger(amountUsdc, USDC_DECIMALS, 'amountUsdc');
  const rate = decimalToScaledInteger(effectiveRateBrlPerUsdc, INTERNAL_DECIMAL_SCALE, 'quote rate');

  if (amount <= ZERO_BIGINT) {
    throw new OfframpValidationError('amountUsdc must be greater than zero.');
  }

  const quotedBrl = multiplyScaledToOutputScale(amount, USDC_DECIMALS, rate, INTERNAL_DECIMAL_SCALE, BRL_DECIMALS);
  return formatScaledInteger(quotedBrl, BRL_DECIMALS, {
    minFractionDigits: 2,
    maxFractionDigits: Number(BRL_DECIMALS),
  });
}

export async function createOfframpQuote(input: CreateOfframpQuoteInput): Promise<OfframpQuoteResponse> {
  const amountUsdc = normalizeOfframpAmountUsdc(input.amountUsdc);
  const payoutPixKey = input.payoutPixKey?.trim()
    ? normalizeOfframpPayoutPixKey(input.payoutPixKey)
    : OFFRAMP_QUOTE_PLACEHOLDER_PIX_KEY;

  const integratorExternalId = input.integratorExternalId?.trim() || null;
  if (integratorExternalId && (input.actorClientId || input.actorUserId)) {
    const duplicate = await findOfframpOrderByIntegratorExternalId({
      clientId: input.actorClientId ?? undefined,
      userId: input.actorClientId ? undefined : (input.actorUserId ?? undefined),
      externalId: integratorExternalId,
    });
    if (duplicate) {
      throw new OfframpOperationError(`externalId "${integratorExternalId}" is already in use.`, 409);
    }
  }

  const symbol = getOfframpQuoteSymbol();
  const spreadBps = input.quoteSpreadBps ?? getOfframpQuoteSpreadBps();
  const ttlSeconds = getOfframpQuoteTtlSeconds();
  const ticker = await binance.market.getTickerPrice(symbol);
  const effectiveRate = applyOfframpQuoteSpread(ticker.price, spreadBps);
  const amountBrl = calculateQuotedBrlAmount(amountUsdc, effectiveRate);

  assertAmountBrlWithinLimit(amountBrl, input.apiKeyMaxAmountBrl, 'offramp');

  try {
    await assertBinanceMarketQuoteNotionalForSymbol(symbol, amountBrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new OfframpValidationError(message);
  }
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  const created = await createQuotedOfframpOrder({
    amountUsdc,
    amountBrl,
    payoutPixKey,
    payoutBeneficiaryName: input.payoutBeneficiaryName ?? null,
    quoteSymbol: symbol,
    quoteSide: 'SELL',
    quoteExpiresAt: expiresAt,
    quoteRate: effectiveRate,
    quoteSource: 'binance:api/v3/ticker/price',
    quoteSpreadBps: spreadBps,
    createdByEmail: input.actorEmail ?? null,
    createdByUserId: input.actorUserId ?? null,
    clientId: input.actorClientId ?? null,
    integratorExternalId,
    metadata: {
      quote: {
        tickerSymbol: ticker.symbol,
        tickerPrice: ticker.price,
        effectiveRate,
        spreadBps,
        ttlSeconds,
      },
      reservation: {
        mode: 'logical_order_row',
      },
    },
  });

  if (!created.ok) {
    console.error('[offramp/quote] failed to persist quoted order', {
      reason: created.reason,
      symbol,
    });
    throw new OfframpOperationError('Failed to persist off-ramp quote.');
  }

  return {
    orderId: created.row.id,
    externalId: created.row.integrator_external_id,
    status: 'quoted',
    quote: {
      symbol: created.row.quote_symbol,
      side: created.row.quote_side,
      amountUsdc: created.row.amount_usdc,
      amountBrl: created.row.amount_brl,
      rate: created.row.quote_rate ?? '',
      expiresAt: created.row.quote_expires_at,
    },
    payout: {
      key: created.row.payout_pix_key,
      beneficiaryName: created.row.payout_beneficiary_name,
    },
  };
}
