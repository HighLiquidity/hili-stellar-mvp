import '@/lib/server/only';

import { readBrhBalanceAdmin } from '@/lib/brh/balance-store';
import { createCorpXAdapterFromEnv } from '@/lib/corpx/adapter';
import { binance } from '@/lib/server/binance';
import { fetchHorizonAccountBalances } from '@/lib/stellar/horizon';
import { resolveTreasuryDepositAddress, resolveTreasuryDepositMemo } from '@/lib/onramp/treasury-deposit';

import { listPendingTreasuryRefills } from './pending-refills';
import { listTreasuryRuns } from './runs-store';
import type {
  TreasuryAssetSpot,
  TreasuryOverviewResponse,
  TreasuryPocketId,
  TreasuryPocketRefreshResponse,
  TreasuryPocketResult,
  TreasuryPockets,
} from './types';

export const TREASURY_POCKET_IDS: readonly TreasuryPocketId[] = [
  'corpx',
  'binance',
  'distributor',
  'brh',
] as const;

export function isTreasuryPocketId(value: string): value is TreasuryPocketId {
  return (TREASURY_POCKET_IDS as readonly string[]).includes(value);
}

function pocketError(error: unknown): TreasuryPocketResult<Record<string, never>> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  };
}

function findBinanceSpot(
  balances: Array<{ asset: string; free: string; locked: string }>,
  asset: string,
): TreasuryAssetSpot {
  const match = balances.find((entry) => entry.asset.toUpperCase() === asset);
  return {
    free: match?.free ?? '0',
    locked: match?.locked ?? '0',
  };
}

async function loadCorpXPocket(): Promise<TreasuryPockets['corpx']> {
  try {
    const adapter = await createCorpXAdapterFromEnv();
    const balance = await adapter.queryBalance({ accountId: adapter.accountId });
    return {
      ok: true,
      accountId: balance.accountId,
      available: balance.available,
      reserved: balance.reserved,
      total: balance.total,
      currency: balance.currency,
      lastUpdated: balance.lastUpdated,
    };
  } catch (error) {
    return pocketError(error) as TreasuryPockets['corpx'];
  }
}

async function loadBinancePocket(): Promise<TreasuryPockets['binance']> {
  try {
    const client = binance.client.create();
    const account = await binance.account.getAccountInfo(client);
    return {
      ok: true,
      brl: findBinanceSpot(account.balances, 'BRL'),
      usdc: findBinanceSpot(account.balances, 'USDC'),
      xlm: findBinanceSpot(account.balances, 'XLM'),
    };
  } catch (error) {
    return pocketError(error) as TreasuryPockets['binance'];
  }
}

async function loadDistributorPocket(): Promise<TreasuryPockets['distributor']> {
  try {
    const address = resolveTreasuryDepositAddress();
    const network = process.env.ONRAMP_USDC_DISTRIBUTOR_NETWORK?.trim().toUpperCase() || 'XLM';
    const addressTag = resolveTreasuryDepositMemo();
    const stellar = await fetchHorizonAccountBalances(address);

    return {
      ok: true,
      address: stellar.accountId,
      network,
      horizonUrl: stellar.horizonUrl,
      stellarNetwork: stellar.network,
      usdc: stellar.usdc,
      xlm: stellar.xlm,
      usdcIssuer: stellar.usdcIssuer,
      addressTag,
    };
  } catch (error) {
    return pocketError(error) as TreasuryPockets['distributor'];
  }
}

async function loadBrhPocket(): Promise<TreasuryPockets['brh']> {
  try {
    const balance = await readBrhBalanceAdmin();
    return { ok: true, balance };
  } catch (error) {
    return pocketError(error) as TreasuryPockets['brh'];
  }
}

/** Loads a single proprietary capital pocket (card-level refresh). */
export async function buildTreasuryPocket(
  pocket: TreasuryPocketId,
): Promise<TreasuryPocketRefreshResponse> {
  const loaders: {
    [K in TreasuryPocketId]: () => Promise<TreasuryPockets[K]>;
  } = {
    corpx: loadCorpXPocket,
    binance: loadBinancePocket,
    distributor: loadDistributorPocket,
    brh: loadBrhPocket,
  };

  const data = await loaders[pocket]();
  return {
    generatedAt: new Date().toISOString(),
    pocket,
    data,
  };
}

/** Aggregates proprietary capital balances for the treasury admin overview. */
export async function buildTreasuryOverview(): Promise<TreasuryOverviewResponse> {
  const [corpx, binancePocket, distributor, brh, pendingRefills, recentRuns] = await Promise.all([
    loadCorpXPocket(),
    loadBinancePocket(),
    loadDistributorPocket(),
    loadBrhPocket(),
    listPendingTreasuryRefills(),
    listTreasuryRuns(10),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    pockets: {
      corpx,
      binance: binancePocket,
      distributor,
      brh,
    },
    pendingRefills,
    recentRuns,
  };
}
