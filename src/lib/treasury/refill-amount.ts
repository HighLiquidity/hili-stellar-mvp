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
