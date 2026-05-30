import '@/lib/server/only';

import { truncateUtf8Bytes } from '@/lib/ramp/memo';

/** Stellar text memo for treasury replenishments (Binance → usdc-distributor). */
export const TREASURY_DEPOSIT_MEMO_MAX_BYTES = 28;

export function resolveTreasuryDepositMemo(): string | null {
  const tag = process.env.ONRAMP_USDC_DISTRIBUTOR_ADDRESS_TAG?.trim();
  if (!tag) {
    return null;
  }

  return truncateUtf8Bytes(tag, TREASURY_DEPOSIT_MEMO_MAX_BYTES);
}

export function resolveTreasuryDepositAddress(): string {
  const address = process.env.ONRAMP_USDC_DISTRIBUTOR_ADDRESS?.trim();
  if (!address) {
    throw new Error('ONRAMP_USDC_DISTRIBUTOR_ADDRESS is required');
  }
  return address;
}
