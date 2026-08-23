import '@/lib/server/only';

import { binance } from '@/lib/server/binance';
import { createOnrampOperation, RampApiError } from '@/lib/ramp/client';
import { getRampCallbackUrl, isRampConfigured } from '@/lib/ramp/config';
import {
  insertRampOperationPending,
  updateRampOperationAfterCreate,
  updateRampOperationFailed,
} from '@/lib/ramp/operation-store';
import { RAMP_ASSET_USDC, RAMP_CATEGORY_TREASURY } from '@/lib/ramp/requests';
import { fetchHorizonAccountBalances } from '@/lib/stellar/horizon';

import { resolveTreasuryDepositAddress } from '@/lib/onramp/treasury-deposit';

import {
  formatRampUsdcAmount,
  getTreasuryBinanceMinDepositUsdc,
  projectTreasuryUsdcDrainBalances,
  resolveTreasuryUsdcDrainAmount,
} from './drain-amount';
import { findTreasuryRunById, insertTreasuryRun, updateTreasuryRun } from './runs-store';
import type {
  TreasuryRunRow,
  TreasuryRunStep,
  TreasuryUsdcDrainPlan,
  TreasuryUsdcDrainRequest,
} from './run-types';
import { resolveBinanceUsdcDepositDestination } from './usdc-drain-destination';
import {
  buildTreasuryUsdcDrainExternalId,
  isTreasuryUsdcDrainExternalId,
  parseTreasuryUsdcDrainRunId,
} from './usdc-drain-references';

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

function formatError(error: unknown): string {
  if (error instanceof RampApiError) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

async function readBinanceUsdcFree(): Promise<string> {
  try {
    const client = binance.client.create();
    const account = await binance.account.getAccountInfo(client);
    const match = account.balances.find((entry) => entry.asset.toUpperCase() === 'USDC');
    return match?.free?.trim() || '0';
  } catch {
    return 'unavailable';
  }
}

export async function buildTreasuryUsdcDrainPlan(
  input: Pick<TreasuryUsdcDrainRequest, 'amount'> = {},
): Promise<TreasuryUsdcDrainPlan> {
  if (!isRampConfigured()) {
    throw new Error('Ramp API is not configured (RAMP_API_BASE_URL, RAMP_API_KEY, callback URL).');
  }

  const distributorAddress = resolveTreasuryDepositAddress();
  const stellar = await fetchHorizonAccountBalances(distributorAddress);
  const destination = await resolveBinanceUsdcDepositDestination();
  const amount = resolveTreasuryUsdcDrainAmount({
    requestedAmount: input.amount,
    distributorUsdc: stellar.usdc,
  });
  const binanceUsdcFree = await readBinanceUsdcFree();
  const projection = projectTreasuryUsdcDrainBalances({
    amount,
    distributorUsdc: stellar.usdc,
    binanceUsdcFree,
  });

  const steps: TreasuryRunStep[] = [
    step('read_distributor_usdc', 'planned', `usdc=${stellar.usdc}`),
    step('resolve_binance_deposit', 'planned', `${destination.address} memo=${destination.tag ?? 'none'} via ${destination.source}`),
    step('normalize_amount', 'planned', `amount=${amount} min=${getTreasuryBinanceMinDepositUsdc()}`),
    step(
      'ramp_usdc_onramp',
      'planned',
      `USDC ${amount} distributor → Binance (${destination.network}) category=treasury`,
    ),
  ];

  return {
    kind: 'distributor_usdc_to_binance',
    amount,
    distributorUsdc: stellar.usdc,
    distributorUsdcAfter: projection.distributorAfter,
    binanceUsdcFree,
    binanceUsdcAfter: projection.binanceAfter,
    minDeposit: getTreasuryBinanceMinDepositUsdc(),
    destination,
    paymentHint: 'ramp_usdc_onramp_category_treasury',
    steps,
  };
}

export type TreasuryUsdcDrainResult = {
  dryRun: boolean;
  plan: TreasuryUsdcDrainPlan;
  run: TreasuryRunRow;
};

function mapRampStatusToRun(status: string): 'completed' | 'failed' | 'running' {
  if (status === 'confirmed') return 'completed';
  if (
    status === 'failed' ||
    status === 'insufficient_funds' ||
    status === 'needs_review' ||
    status === 'callback_failed'
  ) {
    return 'failed';
  }
  return 'running';
}

/** Dry-run or execute USDC usdc-distributor → Binance via Ramp onramp (category=treasury). */
export async function runTreasuryDistributorUsdcToBinance(
  input: TreasuryUsdcDrainRequest,
): Promise<TreasuryUsdcDrainResult> {
  const plan = await buildTreasuryUsdcDrainPlan({ amount: input.amount });
  const trigger = input.trigger ?? 'manual';

  if (input.dryRun) {
    const run = await insertTreasuryRun({
      trigger,
      kind: 'distributor_usdc_to_binance',
      status: 'dry_run',
      dryRun: true,
      requestedAmountUsdc: plan.amount,
      binanceUsdcFree: plan.binanceUsdcFree,
      distributorAddress: plan.destination.address,
      distributorAddressTag: plan.destination.tag,
      binanceWithdrawNetwork: plan.destination.network,
      steps: plan.steps.map((entry) => ({ ...entry, status: 'ok' as const })),
      createdByUserId: input.actor?.userId,
      createdByEmail: input.actor?.email,
      sourceOfframpOrderId: input.sourceOfframpOrderId ?? null,
    });
    return { dryRun: true, plan, run };
  }

  const callbackUrl = getRampCallbackUrl();
  if (!callbackUrl?.startsWith('https://')) {
    throw new Error('Ramp callback URL must be HTTPS for treasury USDC drain.');
  }

  let run = await insertTreasuryRun({
    trigger,
    kind: 'distributor_usdc_to_binance',
    status: 'pending',
    dryRun: false,
    requestedAmountUsdc: plan.amount,
    binanceUsdcFree: plan.binanceUsdcFree,
    distributorAddress: plan.destination.address,
    distributorAddressTag: plan.destination.tag,
    binanceWithdrawNetwork: plan.destination.network,
    steps: [step('create_run', 'ok')],
    createdByUserId: input.actor?.userId,
    createdByEmail: input.actor?.email,
    sourceOfframpOrderId: input.sourceOfframpOrderId ?? null,
  });

  const externalId = buildTreasuryUsdcDrainExternalId(run.id);
  const rampAmount = formatRampUsdcAmount(plan.amount);

  run = await updateTreasuryRun(run.id, {
    status: 'running',
    binanceWithdrawOrderId: externalId,
    steps: [...run.steps, step('persist_external_id', 'ok', externalId)],
  });

  const pending = await insertRampOperationPending({
    externalId,
    operationType: 'onramp',
    status: 'pending_local',
    amount: rampAmount,
    destination: plan.destination.address,
    memo: plan.destination.tag,
  });

  if (!pending.ok) {
    const reason = `Failed to persist Ramp operation pending row: ${pending.reason}`;
    run = await updateTreasuryRun(run.id, {
      status: 'failed',
      steps: [...run.steps, step('ramp_usdc_onramp', 'failed', reason)],
      error: reason,
    });
    throw new Error(reason);
  }

  try {
    const created = await createOnrampOperation({
      amount: rampAmount,
      externalId,
      callbackUrl,
      destination: plan.destination.address,
      memo: plan.destination.tag ?? undefined,
      assetCode: RAMP_ASSET_USDC,
      category: RAMP_CATEGORY_TREASURY,
      payoutMethod: 'classic',
    });

    await updateRampOperationAfterCreate({
      externalId,
      rampOperationId: created.id,
      status: created.status,
    });

    const mapped = mapRampStatusToRun(created.status);
    run = await updateTreasuryRun(run.id, {
      status: mapped,
      executedAmountUsdc: mapped === 'failed' ? null : plan.amount,
      binanceWithdrawId: created.id,
      steps: [
        ...run.steps,
        step(
          'ramp_usdc_onramp',
          mapped === 'failed' ? 'failed' : 'ok',
          `rampOperationId=${created.id} status=${created.status}`,
        ),
      ],
      error: mapped === 'failed' ? `Ramp returned status "${created.status}"` : null,
    });

    if (mapped === 'failed') {
      throw new Error(`Ramp returned status "${created.status}"`);
    }

    return { dryRun: false, plan, run };
  } catch (error) {
    const reason = formatError(error);
    if (run.status !== 'failed') {
      await updateRampOperationFailed({
        externalId,
        status: 'failed',
        failureReason: reason,
      });
      run = await updateTreasuryRun(run.id, {
        status: 'failed',
        steps: [...run.steps, step('ramp_usdc_onramp', 'failed', reason)],
        error: reason,
      });
    }
    throw new Error(reason);
  }
}

export async function applyTreasuryUsdcDrainRampCallback(input: {
  externalId: string;
  rampOperationId: string;
  status: string;
  txHash?: string | null;
  failureReason?: string | null;
}): Promise<void> {
  if (!isTreasuryUsdcDrainExternalId(input.externalId)) {
    return;
  }

  const runId = parseTreasuryUsdcDrainRunId(input.externalId);
  const run = runId ? await findTreasuryRunById(runId) : null;
  if (!run || run.kind !== 'distributor_usdc_to_binance' || run.dry_run) {
    console.warn('[treasury/usdc-drain] callback for unknown or dry-run external id', {
      externalId: input.externalId,
      rampOperationId: input.rampOperationId,
    });
    return;
  }

  if (run.status === 'completed') {
    return;
  }

  const mapped = mapRampStatusToRun(input.status);
  if (mapped === 'running') {
    await updateTreasuryRun(run.id, {
      binanceWithdrawId: input.rampOperationId,
      steps: [
        ...run.steps,
        step('ramp_callback', 'ok', `status=${input.status} rampOperationId=${input.rampOperationId}`),
      ],
    });
    return;
  }

  if (mapped === 'completed') {
    await updateTreasuryRun(run.id, {
      status: 'completed',
      executedAmountUsdc: run.executed_amount_usdc ?? run.requested_amount_usdc,
      binanceWithdrawId: input.rampOperationId,
      steps: [
        ...run.steps,
        step(
          'ramp_confirmed',
          'ok',
          `txHash=${input.txHash ?? 'none'} rampOperationId=${input.rampOperationId}`,
        ),
      ],
      error: null,
    });
    return;
  }

  const reason =
    input.failureReason ?? `Ramp USDC drain returned status "${input.status}".`;
  await updateTreasuryRun(run.id, {
    status: 'failed',
    binanceWithdrawId: input.rampOperationId,
    steps: [...run.steps, step('ramp_callback', 'failed', reason)],
    error: reason,
  });
}
