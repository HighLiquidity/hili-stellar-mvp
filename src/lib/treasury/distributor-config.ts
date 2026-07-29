import '@/lib/server/only';

import { resolveTreasuryDepositAddress, resolveTreasuryDepositMemo } from '@/lib/onramp/treasury-deposit';

import type { TreasuryRefillAsset } from './run-types';

export type TreasuryDistributorConfig = {
  coin: TreasuryRefillAsset;
  address: string;
  network: string;
  addressTag?: string;
  name?: string;
};

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeRequiredString(value: string | undefined, fieldName: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required for treasury refill.`);
  }
  return normalized;
}

/** Destination for Binance → Stellar distributor withdraws (USDC or native XLM). */
export function readTreasuryDistributorConfig(
  asset: TreasuryRefillAsset = 'USDC',
): TreasuryDistributorConfig {
  return {
    coin: asset,
    address: resolveTreasuryDepositAddress(),
    network: normalizeRequiredString(
      process.env.ONRAMP_USDC_DISTRIBUTOR_NETWORK,
      'ONRAMP_USDC_DISTRIBUTOR_NETWORK',
    ).toUpperCase(),
    addressTag:
      normalizeOptionalString(process.env.ONRAMP_USDC_DISTRIBUTOR_ADDRESS_TAG) ??
      resolveTreasuryDepositMemo() ??
      undefined,
    name: normalizeOptionalString(process.env.ONRAMP_USDC_DISTRIBUTOR_NAME),
  };
}
