import '@/lib/server/only';

import { binance } from '@/lib/server/binance';
import { buildBinanceClientOrderId } from '@/lib/server/binance/client-order-id';
import { BinanceRequestError } from '@/lib/server/binance/errors';

import { readTreasuryDistributorConfig } from './distributor-config';
import { getTreasuryMinWithdraw, resolveTreasuryRefillAmount } from './refill-amount';
import { insertTreasuryRun, updateTreasuryRun } from './runs-store';
import type {
  TreasuryRefillAsset,
  TreasuryRefillPlan,
  TreasuryRefillRequest,
  TreasuryRunRow,
  TreasuryRunStep,
} from './run-types';
import { treasuryKindForAsset } from './run-types';

export { resolveTreasuryRefillAmount, resolveTreasuryRefillAmountUsdc } from './refill-amount';

function nowIso(): string {
  return new Date().toISOString();
}

function step(
  name: string,
  status: TreasuryRunStep['status'],
  detail?: string,
): TreasuryRunStep {
  return { name, status, detail, at: nowIso() };
}

function formatBinanceError(error: unknown): string {
  if (error instanceof BinanceRequestError) {
    return error.code != null ? `${error.message} (code ${error.code})` : error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

async function readBinanceAssetFree(asset: TreasuryRefillAsset): Promise<string> {
  const client = binance.client.create();
  const account = await binance.account.getAccountInfo(client);
  const match = account.balances.find((entry) => entry.asset.toUpperCase() === asset);
  return match?.free?.trim() || '0';
}

export async function buildTreasuryRefillPlan(
  input: Pick<TreasuryRefillRequest, 'asset' | 'amount'> = { asset: 'USDC' },
): Promise<TreasuryRefillPlan> {
  const asset = input.asset ?? 'USDC';
  const distributor = readTreasuryDistributorConfig(asset);
  const binanceFree = await readBinanceAssetFree(asset);
  const amount = resolveTreasuryRefillAmount({
    asset,
    requestedAmount: input.amount,
    binanceFree,
  });
  const minWithdraw = getTreasuryMinWithdraw(asset);
  const kind = treasuryKindForAsset(asset);

  const steps: TreasuryRunStep[] = [
    step(`read_binance_${asset.toLowerCase()}`, 'planned', `free=${binanceFree}`),
    step('normalize_amount', 'planned', `amount=${amount} min=${minWithdraw}`),
    step(
      'binance_withdraw',
      'planned',
      `${asset} ${amount} → ${distributor.address} (${distributor.network})`,
    ),
  ];

  return {
    kind,
    asset,
    amount,
    binanceFree,
    minWithdraw,
    distributor: {
      address: distributor.address,
      network: distributor.network,
      addressTag: distributor.addressTag ?? null,
      name: distributor.name ?? null,
    },
    steps,
  };
}

export type TreasuryRefillResult = {
  dryRun: boolean;
  plan: TreasuryRefillPlan;
  run: TreasuryRunRow;
};

/** Dry-run or execute a manual Binance → distributor refill (USDC or XLM). */
export async function runTreasuryBinanceRefill(
  input: TreasuryRefillRequest,
): Promise<TreasuryRefillResult> {
  const plan = await buildTreasuryRefillPlan({ asset: input.asset, amount: input.amount });
  const trigger = input.trigger ?? 'manual';

  if (input.dryRun) {
    const run = await insertTreasuryRun({
      trigger,
      kind: plan.kind,
      status: 'dry_run',
      dryRun: true,
      requestedAmountUsdc: plan.amount,
      binanceUsdcFree: plan.binanceFree,
      distributorAddress: plan.distributor.address,
      distributorAddressTag: plan.distributor.addressTag,
      binanceWithdrawNetwork: plan.distributor.network,
      steps: plan.steps.map((entry) => ({ ...entry, status: 'ok' as const })),
      createdByUserId: input.actor?.userId,
      createdByEmail: input.actor?.email,
    });

    return { dryRun: true, plan, run };
  }

  let run = await insertTreasuryRun({
    trigger,
    kind: plan.kind,
    status: 'pending',
    dryRun: false,
    requestedAmountUsdc: plan.amount,
    binanceUsdcFree: plan.binanceFree,
    distributorAddress: plan.distributor.address,
    distributorAddressTag: plan.distributor.addressTag,
    binanceWithdrawNetwork: plan.distributor.network,
    steps: [step('create_run', 'ok')],
    createdByUserId: input.actor?.userId,
    createdByEmail: input.actor?.email,
  });

  const withdrawOrderId = buildBinanceClientOrderId('trw_', run.id);

  run = await updateTreasuryRun(run.id, {
    status: 'running',
    binanceWithdrawOrderId: withdrawOrderId,
    steps: [...run.steps, step('persist_withdraw_order_id', 'ok', withdrawOrderId)],
  });

  try {
    const existing = await binance.withdraw.getWithdrawByOrderId(withdrawOrderId);
    if (existing?.id) {
      run = await updateTreasuryRun(run.id, {
        status: 'completed',
        executedAmountUsdc: existing.amount ?? plan.amount,
        binanceWithdrawId: existing.id,
        binanceWithdrawNetwork:
          existing.network?.toUpperCase() ?? plan.distributor.network,
        steps: [
          ...run.steps,
          step('sync_existing_withdraw', 'ok', `withdrawId=${existing.id}`),
        ],
        error: null,
      });
      return { dryRun: false, plan, run };
    }

    const result = await binance.withdraw.requestCryptoWithdraw({
      coin: plan.asset,
      address: plan.distributor.address,
      amount: plan.amount,
      network: plan.distributor.network,
      addressTag: plan.distributor.addressTag ?? undefined,
      name: plan.distributor.name ?? undefined,
      withdrawOrderId,
    });

    run = await updateTreasuryRun(run.id, {
      status: 'completed',
      executedAmountUsdc: plan.amount,
      binanceWithdrawId: result.id,
      binanceWithdrawNetwork: plan.distributor.network,
      steps: [
        ...run.steps,
        step('binance_withdraw', 'ok', `withdrawId=${result.id} amount=${plan.amount}`),
      ],
      error: null,
    });

    return { dryRun: false, plan, run };
  } catch (error) {
    const reason = formatBinanceError(error);
    run = await updateTreasuryRun(run.id, {
      status: 'failed',
      steps: [...run.steps, step('binance_withdraw', 'failed', reason)],
      error: reason,
    });
    throw new Error(reason);
  }
}

/** @deprecated Prefer runTreasuryBinanceRefill with asset USDC. */
export async function runTreasuryBinanceUsdcRefill(
  input: Omit<TreasuryRefillRequest, 'asset'> & { amountUsdc?: string | null },
): Promise<TreasuryRefillResult> {
  return runTreasuryBinanceRefill({
    dryRun: input.dryRun,
    asset: 'USDC',
    amount: input.amount ?? input.amountUsdc,
    trigger: input.trigger,
    actor: input.actor,
  });
}
