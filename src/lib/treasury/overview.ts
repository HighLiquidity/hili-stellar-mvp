import '@/lib/server/only';

import { readBrhBalanceAdmin } from '@/lib/brh/balance-store';
import { createCorpXAdapterFromEnv } from '@/lib/corpx/adapter';
import { binance } from '@/lib/server/binance';
import { fetchHorizonAccountBalances } from '@/lib/stellar/horizon';
import { resolveTreasuryDepositAddress, resolveTreasuryDepositMemo } from '@/lib/onramp/treasury-deposit';

import { listPendingTreasuryRefills } from './pending-refills';
import type { TreasuryAssetSpot, TreasuryOverviewResponse, TreasuryPocketResult } from './types';

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

async function loadCorpXPocket(): Promise<TreasuryOverviewResponse['pockets']['corpx']> {
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
    return pocketError(error) as TreasuryOverviewResponse['pockets']['corpx'];
  }
}

async function loadBinancePocket(): Promise<TreasuryOverviewResponse['pockets']['binance']> {
  try {
    const client = binance.client.create();
    const account = await binance.account.getAccountInfo(client);
    return {
      ok: true,
      brl: findBinanceSpot(account.balances, 'BRL'),
      usdc: findBinanceSpot(account.balances, 'USDC'),
    };
  } catch (error) {
    return pocketError(error) as TreasuryOverviewResponse['pockets']['binance'];
  }
}

async function loadDistributorPocket(): Promise<TreasuryOverviewResponse['pockets']['distributor']> {
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
    return pocketError(error) as TreasuryOverviewResponse['pockets']['distributor'];
  }
}

async function loadBrhPocket(): Promise<TreasuryOverviewResponse['pockets']['brh']> {
  try {
    const balance = await readBrhBalanceAdmin();
    return { ok: true, balance };
  } catch (error) {
    return pocketError(error) as TreasuryOverviewResponse['pockets']['brh'];
  }
}

/** Aggregates proprietary capital balances for the treasury admin overview. */
export async function buildTreasuryOverview(): Promise<TreasuryOverviewResponse> {
  const [corpx, binancePocket, distributor, brh, pendingRefills] = await Promise.all([
    loadCorpXPocket(),
    loadBinancePocket(),
    loadDistributorPocket(),
    loadBrhPocket(),
    listPendingTreasuryRefills(),
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
  };
}
