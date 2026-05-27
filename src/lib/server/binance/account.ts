import '@/lib/server/only';

import { BinanceClient, createBinanceClient } from './client';
import type { BinanceAccountInfo, BinanceNonZeroBalance } from './types';

function hasNonZeroDecimalValue(value: string): boolean {
  return /[1-9]/.test(value.trim());
}

export function filterNonZeroBalances(balances: BinanceAccountInfo['balances']): BinanceNonZeroBalance[] {
  return balances.filter((balance) => {
    return hasNonZeroDecimalValue(balance.free) || hasNonZeroDecimalValue(balance.locked);
  });
}

/** Account endpoints and balance helpers for signed Binance access. */
export async function getAccountInfo(
  client: BinanceClient = createBinanceClient(),
): Promise<BinanceAccountInfo> {
  return client.signedGet<BinanceAccountInfo>('/api/v3/account');
}

export async function getNonZeroBalances(
  client: BinanceClient = createBinanceClient(),
): Promise<BinanceNonZeroBalance[]> {
  const account = await getAccountInfo(client);
  return filterNonZeroBalances(account.balances);
}
