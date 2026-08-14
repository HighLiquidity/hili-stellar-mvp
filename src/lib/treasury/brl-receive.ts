import '@/lib/server/only';

import { createCorpXAdapterFromEnv } from '@/lib/corpx/adapter';
import { binance } from '@/lib/server/binance';

import { projectBinanceBrlWithdrawBalances, resolveTreasuryBinanceBrlWithdrawAmount } from './brl-amount';
import {
  BINANCE_FIAT_SETTLEMENT_POLL_MAX_MS,
  BINANCE_FIAT_SETTLEMENT_POLL_MS,
  describeSettlementProbe,
  isBinanceFiatOrderFailed,
  isBinanceFiatOrderPaid,
  readFiatOrderStatus,
  type SettlementProbeResult,
} from './brl-transfer-pix';
import { summarizeFiatOrderDetail } from './pix-emv-extract';
import { insertTreasuryRun, updateTreasuryRun } from './runs-store';
import type {
  TreasuryBrlReceivePlan,
  TreasuryBrlReceiveRequest,
  TreasuryRunRow,
  TreasuryRunStep,
} from './run-types';

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function throwIfBinanceOrderFailed(orderId: string, detail: unknown): void {
  if (!isBinanceFiatOrderFailed(detail)) return;
  throw new Error(
    `Binance fiat withdraw order ${orderId} failed. ${summarizeFiatOrderDetail(detail)}`,
  );
}

async function probeBinanceFiatWithdrawSettlement(orderId: string): Promise<SettlementProbeResult> {
  const deadline = Date.now() + BINANCE_FIAT_SETTLEMENT_POLL_MAX_MS;
  let detail: unknown = null;

  while (Date.now() <= deadline) {
    detail = await binance.fiat.getOrderDetail(orderId);
    throwIfBinanceOrderFailed(orderId, detail);

    if (isBinanceFiatOrderPaid(detail)) {
      return {
        detail,
        paid: true,
        status: readFiatOrderStatus(detail),
      };
    }

    if (Date.now() + BINANCE_FIAT_SETTLEMENT_POLL_MS > deadline) {
      break;
    }
    await sleep(BINANCE_FIAT_SETTLEMENT_POLL_MS);
  }

  return {
    detail,
    paid: false,
    status: readFiatOrderStatus(detail),
  };
}

export async function buildTreasuryBrlReceivePlan(
  input: Pick<TreasuryBrlReceiveRequest, 'amountBrl'> = {},
): Promise<TreasuryBrlReceivePlan> {
  const accountInfo = binance.fiat.readBrlWithdrawAccountInfoFromEnv();
  const destinationMasked = binance.fiat.maskBankAccountNumber(accountInfo.accountNumber);

  const client = binance.client.create();
  const account = await binance.account.getAccountInfo(client);
  const match = account.balances.find((entry) => entry.asset.toUpperCase() === 'BRL');
  const binanceBrlFree = match?.free?.trim() || '0';

  const amountBrl = resolveTreasuryBinanceBrlWithdrawAmount({
    requestedAmountBrl: input.amountBrl,
    binanceBrlFree,
  });

  let corpxAvailable = 'unavailable';
  try {
    const adapter = await createCorpXAdapterFromEnv();
    const balance = await adapter.queryBalance({ accountId: adapter.accountId });
    corpxAvailable = balance.available;
  } catch {
    corpxAvailable = 'unavailable';
  }

  const projection = projectBinanceBrlWithdrawBalances({
    amountBrl,
    binanceBrlFree,
    corpxAvailable,
  });

  const steps: TreasuryRunStep[] = [
    step('read_binance_brl', 'planned', `free=${binanceBrlFree}`),
    step('normalize_amount', 'planned', `amount=${amountBrl}`),
    step('binance_fiat_withdraw', 'planned', `BRL ${amountBrl} bank_transfer → ${destinationMasked}`),
    step('await_binance_settlement', 'planned', 'poll fiat order detail'),
  ];

  return {
    kind: 'binance_brl_to_corpx',
    amountBrl,
    corpxAvailable,
    binanceBrlFree,
    binanceBrlAfter: projection.binanceBrlAfter,
    corpxBrlAfter: projection.corpxBrlAfter,
    destinationMasked,
    paymentHint: 'binance_fiat_withdraw_bank_transfer',
    steps,
  };
}

export type TreasuryBrlReceiveResult = {
  dryRun: boolean;
  plan: TreasuryBrlReceivePlan;
  run: TreasuryRunRow;
  binanceOrder?: {
    orderId: string;
    detail: unknown;
    settled: boolean;
  };
};

/** Dry-run or execute Binance BRL → CorpX fiat bank withdraw. */
export async function runTreasuryBinanceBrlToCorpx(
  input: TreasuryBrlReceiveRequest,
): Promise<TreasuryBrlReceiveResult> {
  const plan = await buildTreasuryBrlReceivePlan({ amountBrl: input.amountBrl });
  const trigger = input.trigger ?? 'manual';

  if (input.dryRun) {
    const run = await insertTreasuryRun({
      trigger,
      kind: 'binance_brl_to_corpx',
      status: 'dry_run',
      dryRun: true,
      requestedAmountUsdc: plan.amountBrl,
      binanceUsdcFree: plan.binanceBrlFree,
      steps: plan.steps.map((entry) => ({ ...entry, status: 'ok' as const })),
      createdByUserId: input.actor?.userId,
      createdByEmail: input.actor?.email,
    });
    return { dryRun: true, plan, run };
  }

  let run = await insertTreasuryRun({
    trigger,
    kind: 'binance_brl_to_corpx',
    status: 'pending',
    dryRun: false,
    requestedAmountUsdc: plan.amountBrl,
    binanceUsdcFree: plan.binanceBrlFree,
    steps: [step('create_run', 'ok')],
    createdByUserId: input.actor?.userId,
    createdByEmail: input.actor?.email,
  });

  run = await updateTreasuryRun(run.id, {
    status: 'running',
    steps: [...run.steps, step('start', 'ok')],
  });

  try {
    const accountInfo = binance.fiat.readBrlWithdrawAccountInfoFromEnv();
    const withdraw = await binance.fiat.createWithdraw({
      currency: 'BRL',
      apiPaymentMethod: 'bank_transfer',
      amount: plan.amountBrl,
      accountInfo,
      ext: {
        hiliTreasuryRunId: run.id,
        hiliPurpose: 'binance_brl_to_corpx',
      },
    });

    if (!withdraw.orderId?.trim()) {
      throw new Error('Binance fiat withdraw returned empty orderId');
    }

    run = await updateTreasuryRun(run.id, {
      binanceWithdrawOrderId: withdraw.orderId,
      steps: [
        ...run.steps,
        step('binance_fiat_withdraw', 'ok', `orderId=${withdraw.orderId}`),
      ],
    });

    const settlement = await probeBinanceFiatWithdrawSettlement(withdraw.orderId);

    run = await updateTreasuryRun(run.id, {
      status: 'completed',
      executedAmountUsdc: plan.amountBrl,
      binanceWithdrawId: withdraw.orderId,
      steps: [
        ...run.steps,
        step('binance_settlement_probe', 'ok', describeSettlementProbe(settlement)),
      ],
      error: null,
    });

    return {
      dryRun: false,
      plan,
      run,
      binanceOrder: {
        orderId: withdraw.orderId,
        detail: settlement.detail,
        settled: settlement.paid,
      },
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    run = await updateTreasuryRun(run.id, {
      status: 'failed',
      steps: [...run.steps, step('binance_brl_to_corpx', 'failed', reason)],
      error: reason,
    });
    throw new Error(reason);
  }
}
