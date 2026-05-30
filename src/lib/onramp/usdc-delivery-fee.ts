/** Default Stellar USDC delivery fee passed to Ramp (Binance refill fee is separate). */
export const DEFAULT_ONRAMP_USDC_DELIVERY_FEE_USDC = '1';

const USDC_DECIMALS = BigInt(7);
const TEN = BigInt(10);

function pow10(scale: bigint): bigint {
  return TEN ** scale;
}

function parsePositiveUsdcToScaled(value: string, fieldName: string): bigint {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error(`${fieldName} must be a positive decimal string.`);
  }

  const [wholePart, fractionPart = ''] = normalized.split('.');
  if (BigInt(fractionPart.length) > USDC_DECIMALS) {
    throw new Error(`${fieldName} has too many decimal places.`);
  }

  const paddedFraction = fractionPart.padEnd(Number(USDC_DECIMALS), '0');
  const scaled = BigInt(`${wholePart}${paddedFraction}`);
  if (scaled <= BigInt(0)) {
    throw new Error(`${fieldName} must be greater than zero.`);
  }

  return scaled;
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

export function getOnrampUsdcDeliveryFeeUsdc(): string {
  const fromEnv =
    typeof process !== 'undefined' ? process.env.ONRAMP_USDC_DELIVERY_FEE_USDC?.trim() : undefined;
  if (!fromEnv) {
    return DEFAULT_ONRAMP_USDC_DELIVERY_FEE_USDC;
  }

  return formatScaledUsdc(parsePositiveUsdcToScaled(fromEnv, 'ONRAMP_USDC_DELIVERY_FEE_USDC'));
}

/** Net USDC credited to the client wallet after the delivery fee. */
export function calculateNetUsdcDeliveredToClient(
  grossAmountUsdc: string,
  feeUsdc: string = getOnrampUsdcDeliveryFeeUsdc(),
): string {
  const gross = parsePositiveUsdcToScaled(grossAmountUsdc, 'amountUsdc');
  const fee = parsePositiveUsdcToScaled(feeUsdc, 'USDC delivery fee');

  if (gross <= fee) {
    throw new Error(
      `amountUsdc must be greater than the USDC delivery fee of ${formatScaledUsdc(fee)}.`,
    );
  }

  return formatScaledUsdc(gross - fee);
}

export function assertGrossUsdcCoversDeliveryFee(grossAmountUsdc: string): void {
  calculateNetUsdcDeliveredToClient(grossAmountUsdc);
}
