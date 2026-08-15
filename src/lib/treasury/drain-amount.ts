import { normalizeBinanceUsdcAmount } from '@/lib/onramp/binance-withdraw-min';

export const DEFAULT_TREASURY_BINANCE_MIN_DEPOSIT_USDC = '1';

const DRAIN_AMOUNT_SCALE = 7;

export function getTreasuryBinanceMinDepositUsdc(): string {
  const fromEnv =
    typeof process !== 'undefined'
      ? process.env.TREASURY_BINANCE_MIN_DEPOSIT_USDC?.trim()
      : undefined;
  if (!fromEnv) {
    return DEFAULT_TREASURY_BINANCE_MIN_DEPOSIT_USDC;
  }
  return normalizeBinanceUsdcAmount(fromEnv, 'TREASURY_BINANCE_MIN_DEPOSIT_USDC', DRAIN_AMOUNT_SCALE);
}

function parseToScaled(value: string, fieldName: string): bigint {
  const normalized = normalizeBinanceUsdcAmount(value, fieldName, DRAIN_AMOUNT_SCALE);
  const [whole, fraction = ''] = normalized.split('.');
  const padded = fraction.slice(0, DRAIN_AMOUNT_SCALE).padEnd(DRAIN_AMOUNT_SCALE, '0');
  return BigInt(whole) * BigInt(10) ** BigInt(DRAIN_AMOUNT_SCALE) + BigInt(padded || '0');
}

function formatFromScaled(value: bigint): string {
  if (value < BigInt(0)) {
    throw new Error('amount cannot be negative.');
  }
  const factor = BigInt(10) ** BigInt(DRAIN_AMOUNT_SCALE);
  const whole = value / factor;
  const fraction = (value % factor).toString().padStart(DRAIN_AMOUNT_SCALE, '0').replace(/0+$/, '');
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
}

/** Stellar USDC amount for Ramp onramp (≤7 fractional digits). */
export function formatRampUsdcAmount(amount: string): string {
  const scaled = parseToScaled(amount, 'amount');
  const formatted = formatFromScaled(scaled);
  return formatted.includes('.') ? formatted : `${formatted}.0`;
}

/**
 * Resolves drain amount: explicit request or full distributor USDC.
 * Throws when amount is invalid, below min deposit, or above distributor balance.
 */
export function resolveTreasuryUsdcDrainAmount(input: {
  requestedAmount?: string | null;
  distributorUsdc: string;
}): string {
  const fieldName = 'amount';
  const freeNormalized = normalizeBinanceUsdcAmount(
    input.distributorUsdc,
    'distributor USDC balance',
    DRAIN_AMOUNT_SCALE,
  );

  const rawRequested = input.requestedAmount?.trim();
  const amount = rawRequested
    ? normalizeBinanceUsdcAmount(rawRequested, fieldName, DRAIN_AMOUNT_SCALE)
    : freeNormalized;

  const freeScaled = parseToScaled(freeNormalized, 'distributor USDC balance');
  const amountScaled = parseToScaled(amount, fieldName);
  if (amountScaled > freeScaled) {
    throw new Error(
      `${fieldName} (${amount}) exceeds distributor USDC balance (${freeNormalized}).`,
    );
  }

  const minimum = parseToScaled(getTreasuryBinanceMinDepositUsdc(), 'minimum USDC deposit');
  if (amountScaled < minimum) {
    throw new Error(
      `${fieldName} must be at least ${getTreasuryBinanceMinDepositUsdc()} USDC to drain to Binance.`,
    );
  }

  return amount;
}

export type TreasuryUsdcDrainBalanceProjection = {
  distributorAfter: string;
  binanceAfter: string;
};

export function projectTreasuryUsdcDrainBalances(input: {
  amount: string;
  distributorUsdc: string;
  binanceUsdcFree: string;
}): TreasuryUsdcDrainBalanceProjection {
  const amountScaled = parseToScaled(input.amount, 'amount');
  const distributorScaled = parseToScaled(input.distributorUsdc, 'distributor USDC balance');
  if (distributorScaled < amountScaled) {
    throw new Error(
      `amount (${input.amount}) exceeds distributor USDC balance (${input.distributorUsdc}).`,
    );
  }

  let binanceAfter = 'unavailable';
  const currentBinance = input.binanceUsdcFree.trim();
  if (currentBinance && currentBinance !== 'unavailable') {
    const binanceScaled = parseToScaled(currentBinance, 'Binance USDC free balance');
    binanceAfter = formatFromScaled(binanceScaled + amountScaled);
  }

  return {
    distributorAfter: formatFromScaled(distributorScaled - amountScaled),
    binanceAfter,
  };
}
