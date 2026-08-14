import {
  assertUsdcMeetsBinanceMinWithdraw,
  getOnrampBinanceMinWithdrawUsdc,
  normalizeBinanceUsdcAmount,
} from '@/lib/onramp/binance-withdraw-min';

import type { TreasuryRefillAsset } from './run-types';

export const DEFAULT_ONRAMP_BINANCE_MIN_WITHDRAW_XLM = '1';

/** Binance minimum XLM withdraw for distributor refill. */
export function getOnrampBinanceMinWithdrawXlm(): string {
  const fromEnv =
    typeof process !== 'undefined' ? process.env.ONRAMP_BINANCE_MIN_WITHDRAW_XLM?.trim() : undefined;
  if (!fromEnv) {
    return DEFAULT_ONRAMP_BINANCE_MIN_WITHDRAW_XLM;
  }
  return normalizeBinanceUsdcAmount(fromEnv, 'ONRAMP_BINANCE_MIN_WITHDRAW_XLM');
}

export function getTreasuryMinWithdraw(asset: TreasuryRefillAsset): string {
  return asset === 'XLM' ? getOnrampBinanceMinWithdrawXlm() : getOnrampBinanceMinWithdrawUsdc();
}

function assertMeetsMinWithdraw(
  asset: TreasuryRefillAsset,
  amount: string,
  fieldName: string,
): void {
  if (asset === 'USDC') {
    assertUsdcMeetsBinanceMinWithdraw(amount, fieldName);
    return;
  }

  const normalizedAmount = normalizeBinanceUsdcAmount(amount, fieldName);
  const amountNum = Number(normalizedAmount);
  const minimum = Number(getOnrampBinanceMinWithdrawXlm());
  if (!Number.isFinite(amountNum) || !Number.isFinite(minimum) || amountNum < minimum) {
    throw new Error(
      `${fieldName} must be at least ${getOnrampBinanceMinWithdrawXlm()} XLM to satisfy the Binance minimum withdraw.`,
    );
  }
}

/**
 * Resolves refill amount: explicit request or full Binance free balance for the asset.
 * Throws when amount is invalid or below Binance minimum withdraw.
 */
export function resolveTreasuryRefillAmount(input: {
  asset: TreasuryRefillAsset;
  requestedAmount?: string | null;
  binanceFree: string;
}): string {
  const fieldName = 'amount';
  const freeNormalized = normalizeBinanceUsdcAmount(
    input.binanceFree,
    `binance ${input.asset} free balance`,
  );

  const rawRequested = input.requestedAmount?.trim();
  const amount = rawRequested
    ? normalizeBinanceUsdcAmount(rawRequested, fieldName)
    : freeNormalized;

  const freeScaled = Number(freeNormalized);
  const amountScaled = Number(amount);
  if (!Number.isFinite(freeScaled) || !Number.isFinite(amountScaled)) {
    throw new Error(`Invalid ${input.asset} amount for treasury refill.`);
  }
  if (amountScaled > freeScaled) {
    throw new Error(
      `${fieldName} (${amount}) exceeds Binance ${input.asset} free balance (${freeNormalized}).`,
    );
  }

  assertMeetsMinWithdraw(input.asset, amount, fieldName);
  return amount;
}

const REFILL_AMOUNT_SCALE = 8;

function parseRefillAmountToScaled(value: string, fieldName: string): bigint {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error(`${fieldName} must be a positive decimal string.`);
  }
  const [whole, fraction = ''] = normalized.split('.');
  const padded = fraction.slice(0, REFILL_AMOUNT_SCALE).padEnd(REFILL_AMOUNT_SCALE, '0');
  return BigInt(whole) * BigInt(10) ** BigInt(REFILL_AMOUNT_SCALE) + BigInt(padded || '0');
}

function formatRefillAmountFromScaled(value: bigint): string {
  if (value < BigInt(0)) {
    throw new Error('amount cannot be negative.');
  }
  const factor = BigInt(10) ** BigInt(REFILL_AMOUNT_SCALE);
  const whole = value / factor;
  const fraction = (value % factor).toString().padStart(REFILL_AMOUNT_SCALE, '0').replace(/0+$/, '');
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
}

export type TreasuryRefillBalanceProjection = {
  binanceAfter: string;
  distributorAfter: string;
};

/**
 * Binance debit = requested amount; distributor is credited the same amount.
 * Network fee is not included (Binance may take extra from remaining free).
 */
export function projectTreasuryRefillBalances(input: {
  amount: string;
  binanceFree: string;
  distributorBalance: string;
  asset: TreasuryRefillAsset;
}): TreasuryRefillBalanceProjection {
  const amount = normalizeBinanceUsdcAmount(input.amount, 'amount');
  const free = normalizeBinanceUsdcAmount(
    input.binanceFree,
    `binance ${input.asset} free balance`,
  );
  const amountScaled = parseRefillAmountToScaled(amount, 'amount');
  const freeScaled = parseRefillAmountToScaled(free, `binance ${input.asset} free balance`);
  if (freeScaled < amountScaled) {
    throw new Error(
      `amount (${amount}) exceeds Binance ${input.asset} free balance (${free}).`,
    );
  }

  let distributorAfter = 'unavailable';
  const currentDistributor = input.distributorBalance.trim();
  if (currentDistributor && currentDistributor !== 'unavailable') {
    const nowScaled = parseRefillAmountToScaled(
      currentDistributor,
      `distributor ${input.asset} balance`,
    );
    distributorAfter = formatRefillAmountFromScaled(nowScaled + amountScaled);
  }

  return {
    binanceAfter: formatRefillAmountFromScaled(freeScaled - amountScaled),
    distributorAfter,
  };
}

/** @deprecated Prefer resolveTreasuryRefillAmount with asset USDC. */
export function resolveTreasuryRefillAmountUsdc(input: {
  requestedAmountUsdc?: string | null;
  binanceUsdcFree: string;
}): string {
  return resolveTreasuryRefillAmount({
    asset: 'USDC',
    requestedAmount: input.requestedAmountUsdc,
    binanceFree: input.binanceUsdcFree,
  });
}
