/** Default Binance minimum USDC withdraw for the configured distributor network. */
export const DEFAULT_ONRAMP_BINANCE_MIN_WITHDRAW_USDC = '5';

/** Binance spot executed quantities for USDC are commonly returned with up to 8 decimals. */
export const BINANCE_USDC_AMOUNT_MAX_DECIMALS = 8;

const USDC_DECIMALS = BigInt(7);
const TEN = BigInt(10);

function pow10(scale: bigint): bigint {
  return TEN ** scale;
}

function parsePositiveDecimalString(value: string, fieldName: string): { whole: string; fraction: string } {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error(`${fieldName} must be a positive decimal string.`);
  }

  const [wholePart, fractionPart = ''] = normalized.split('.');
  return { whole: wholePart, fraction: fractionPart };
}

function parsePositiveUsdcToScaled(value: string, fieldName: string): bigint {
  const { whole, fraction } = parsePositiveDecimalString(value, fieldName);
  if (BigInt(fraction.length) > USDC_DECIMALS) {
    throw new Error(`${fieldName} has too many decimal places.`);
  }

  const paddedFraction = fraction.padEnd(Number(USDC_DECIMALS), '0');
  const scaled = BigInt(`${whole}${paddedFraction}`);
  if (scaled <= BigInt(0)) {
    throw new Error(`${fieldName} must be greater than zero.`);
  }

  return scaled;
}

/** Truncates exchange-sourced USDC amounts to Binance precision before withdraw/compare. */
export function normalizeBinanceUsdcAmount(
  value: string,
  fieldName: string,
  maxFractionDigits: number = BINANCE_USDC_AMOUNT_MAX_DECIMALS,
): string {
  const { whole, fraction } = parsePositiveDecimalString(value, fieldName);
  const truncatedFraction = fraction.slice(0, maxFractionDigits).replace(/0+$/, '');

  if (!truncatedFraction) {
    if (BigInt(whole) <= BigInt(0)) {
      throw new Error(`${fieldName} must be greater than zero.`);
    }

    return whole;
  }

  const normalized = `${whole}.${truncatedFraction}`;
  if (!/[1-9]/.test(normalized)) {
    throw new Error(`${fieldName} must be greater than zero.`);
  }

  return normalized;
}

function formatScaledUsdc(value: bigint): string {
  const factor = pow10(USDC_DECIMALS);
  const whole = value / factor;
  const fraction = value % factor;
  const rawFraction = fraction.toString().padStart(Number(USDC_DECIMALS), '0');
  const trimmedFraction = rawFraction.replace(/0+$/, '');
  if (!trimmedFraction) {
    return whole.toString();
  }

  return `${whole.toString()}.${trimmedFraction}`;
}

export function getOnrampBinanceMinWithdrawUsdc(): string {
  const fromEnv =
    typeof process !== 'undefined' ? process.env.ONRAMP_BINANCE_MIN_WITHDRAW_USDC?.trim() : undefined;
  if (!fromEnv) {
    return DEFAULT_ONRAMP_BINANCE_MIN_WITHDRAW_USDC;
  }

  return formatScaledUsdc(parsePositiveUsdcToScaled(fromEnv, 'ONRAMP_BINANCE_MIN_WITHDRAW_USDC'));
}

export function assertUsdcMeetsBinanceMinWithdraw(amountUsdc: string, fieldName = 'amountUsdc'): void {
  const normalizedAmount = normalizeBinanceUsdcAmount(amountUsdc, fieldName);
  const amount = parsePositiveUsdcToScaled(normalizedAmount, fieldName);
  const minimum = parsePositiveUsdcToScaled(
    getOnrampBinanceMinWithdrawUsdc(),
    'Binance minimum USDC withdraw',
  );

  if (amount < minimum) {
    throw new Error(
      `${fieldName} must be at least ${formatScaledUsdc(minimum)} USDC to satisfy the Binance minimum withdraw.`,
    );
  }
}
