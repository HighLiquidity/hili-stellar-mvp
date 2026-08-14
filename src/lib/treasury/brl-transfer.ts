import '@/lib/server/only';

import { createCorpXAdapterFromEnv } from '@/lib/corpx/adapter';
import type { CorpXPIXKeyType } from '@/lib/corpx/pix/types';
import { binance } from '@/lib/server/binance';

import { resolveTreasuryBrlAmount } from './brl-amount';
import {
  amountForEmvPayout,
  assertCorpXPixOutAccepted,
  BINANCE_FIAT_PIX_POLL_MAX_MS,
  BINANCE_FIAT_PIX_POLL_MS,
  BINANCE_FIAT_SETTLEMENT_POLL_MAX_MS,
  BINANCE_FIAT_SETTLEMENT_POLL_MS,
  describeSettlementProbe,
  formatMissingPixError,
  isBinanceFiatOrderFailed,
  isBinanceFiatOrderPaid,
  readFiatOrderStatus,
  resolvePixPaymentFromOrderDetail,
  type ResolvedPixPayment,
  type SettlementProbeResult,
} from './brl-transfer-pix';
import { summarizeFiatOrderDetail } from './pix-emv-extract';
import { insertTreasuryRun, updateTreasuryRun } from './runs-store';
import type {
  TreasuryBrlTransferPlan,
  TreasuryBrlTransferRequest,
  TreasuryRunRow,
  TreasuryRunStep,
} from './run-types';

export { summarizeFiatOrderDetail } from './pix-emv-extract';

export {
  assertCorpXPixOutAccepted,
  resolvePixPaymentFromOrderDetail,
} from './brl-transfer-pix';

export {
  extractPixEmvFromUnknown,
  extractPixKeyFromUnknown,
} from './pix-emv-extract';

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
    `Binance fiat deposit order ${orderId} failed. ${summarizeFiatOrderDetail(detail)}`,
  );
}

async function waitForBinanceFiatPixPayment(
  orderId: string,
): Promise<{ detail: unknown; payment: ResolvedPixPayment | null }> {
  const deadline = Date.now() + BINANCE_FIAT_PIX_POLL_MAX_MS;
  let detail: unknown = null;

  while (Date.now() <= deadline) {
    detail = await binance.fiat.getOrderDetail(orderId);
    throwIfBinanceOrderFailed(orderId, detail);

    const payment = resolvePixPaymentFromOrderDetail(detail);
    if (payment) {
      return { detail, payment };
    }

    if (Date.now() + BINANCE_FIAT_PIX_POLL_MS > deadline) {
      break;
    }
    await sleep(BINANCE_FIAT_PIX_POLL_MS);
  }

  return { detail, payment: null };
}

async function probeBinanceFiatSettlement(orderId: string): Promise<SettlementProbeResult> {
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

function readFallbackPixKey(): { key: string; keyType: CorpXPIXKeyType } | null {
  const key = process.env.BINANCE_BRL_DEPOSIT_PIX_KEY?.trim();
  if (!key) return null;
  const rawType = (process.env.BINANCE_BRL_DEPOSIT_PIX_KEY_TYPE?.trim().toUpperCase() ||
    'EVP') as CorpXPIXKeyType;
  const allowed: CorpXPIXKeyType[] = ['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP'];
  const keyType = allowed.includes(rawType) ? rawType : 'EVP';
  return { key, keyType };
}

export async function buildTreasuryBrlTransferPlan(
  input: Pick<TreasuryBrlTransferRequest, 'amountBrl'> = {},
): Promise<TreasuryBrlTransferPlan> {
  const adapter = await createCorpXAdapterFromEnv();
  const balance = await adapter.queryBalance({ accountId: adapter.accountId });
  const amountBrl = resolveTreasuryBrlAmount({
    requestedAmountBrl: input.amountBrl,
    corpxAvailable: balance.available,
  });

  let binanceBrlFree = '0';
  try {
    const client = binance.client.create();
    const account = await binance.account.getAccountInfo(client);
    const match = account.balances.find((entry) => entry.asset.toUpperCase() === 'BRL');
    binanceBrlFree = match?.free?.trim() || '0';
  } catch {
    binanceBrlFree = 'unavailable';
  }

  const steps: TreasuryRunStep[] = [
    step('read_corpx_brl', 'planned', `available=${balance.available}`),
    step('normalize_amount', 'planned', `amount=${amountBrl}`),
    step('binance_fiat_deposit', 'planned', `BRL ${amountBrl} via Pix`),
    step('corpx_pix_out', 'planned', 'pay Binance PIX from CorpX'),
  ];

  return {
    kind: 'corpx_brl_to_binance',
    amountBrl,
    corpxAvailable: balance.available,
    binanceBrlFree,
    paymentHint: 'binance_fiat_deposit_then_corpx_pix',
    steps,
  };
}

export type TreasuryBrlTransferResult = {
  dryRun: boolean;
  plan: TreasuryBrlTransferPlan;
  run: TreasuryRunRow;
  /** Present after execute when Binance returned PIX details. */
  binanceOrder?: {
    orderId: string;
    detail: unknown;
    emvFound: boolean;
    settled?: boolean;
  };
};

/** Dry-run or execute CorpX BRL → Binance fiat PIX funding. */
export async function runTreasuryCorpxBrlToBinance(
  input: TreasuryBrlTransferRequest,
): Promise<TreasuryBrlTransferResult> {
  const plan = await buildTreasuryBrlTransferPlan({ amountBrl: input.amountBrl });
  const trigger = input.trigger ?? 'manual';

  if (input.dryRun) {
    const run = await insertTreasuryRun({
      trigger,
      kind: 'corpx_brl_to_binance',
      status: 'dry_run',
      dryRun: true,
      requestedAmountUsdc: plan.amountBrl,
      binanceUsdcFree: plan.corpxAvailable,
      steps: plan.steps.map((entry) => ({ ...entry, status: 'ok' as const })),
      createdByUserId: input.actor?.userId,
      createdByEmail: input.actor?.email,
    });
    return { dryRun: true, plan, run };
  }

  let run = await insertTreasuryRun({
    trigger,
    kind: 'corpx_brl_to_binance',
    status: 'pending',
    dryRun: false,
    requestedAmountUsdc: plan.amountBrl,
    binanceUsdcFree: plan.corpxAvailable,
    steps: [step('create_run', 'ok')],
    createdByUserId: input.actor?.userId,
    createdByEmail: input.actor?.email,
  });

  run = await updateTreasuryRun(run.id, {
    status: 'running',
    steps: [...run.steps, step('start', 'ok')],
  });

  try {
    const deposit = await binance.fiat.createDeposit({
      currency: 'BRL',
      apiPaymentMethod: 'Pix',
      amount: plan.amountBrl,
    });

    run = await updateTreasuryRun(run.id, {
      binanceWithdrawOrderId: deposit.orderId,
      steps: [
        ...run.steps,
        step('binance_fiat_deposit', 'ok', `orderId=${deposit.orderId}`),
      ],
    });

    const { detail, payment: polledPayment } = await waitForBinanceFiatPixPayment(deposit.orderId);
    const adapter = await createCorpXAdapterFromEnv();
    const idempotencyKey = `treasury-brl-${run.id}`;

    const payment: ResolvedPixPayment | null =
      polledPayment ??
      (() => {
        const fallback = readFallbackPixKey();
        return fallback ? { mode: 'key' as const, key: fallback.key, keyType: fallback.keyType } : null;
      })();

    if (payment?.mode === 'emv') {
      const payout = await adapter.pix.payPaymentQrEmv({
        emv: payment.emv,
        amount: amountForEmvPayout(payment.emv, plan.amountBrl),
        amountHint: plan.amountBrl,
        description: `Treasury BRL→Binance ${run.id}`,
        idempotencyKey,
        correlationId: run.id,
      });
      assertCorpXPixOutAccepted(payout);

      const settlement = await probeBinanceFiatSettlement(deposit.orderId);

      run = await updateTreasuryRun(run.id, {
        status: 'completed',
        executedAmountUsdc: plan.amountBrl,
        binanceWithdrawId: payout.providerTxId || payout.e2eId || null,
        steps: [
          ...run.steps,
          step(
            'read_binance_order_detail',
            'ok',
            `emv_found status=${readFiatOrderStatus(detail) || 'unknown'}`,
          ),
          step(
            'corpx_pix_out',
            'ok',
            `providerTxId=${payout.providerTxId} e2e=${payout.e2eId} status=${payout.status}`,
          ),
          step('binance_settlement_probe', 'ok', describeSettlementProbe(settlement)),
        ],
        error: null,
      });

      return {
        dryRun: false,
        plan,
        run,
        binanceOrder: {
          orderId: deposit.orderId,
          detail: settlement.detail ?? detail,
          emvFound: true,
          settled: settlement.paid,
        },
      };
    }

    if (payment?.mode === 'key') {
      const payout = await adapter.pix.initiatePIXCashOut({
        amount: plan.amountBrl,
        pixKey: payment.key,
        pixKeyType: payment.keyType,
        description: `Treasury BRL→Binance ${run.id}`,
        idempotencyKey,
        correlationId: run.id,
      });
      assertCorpXPixOutAccepted(payout);

      const settlement = await probeBinanceFiatSettlement(deposit.orderId);

      run = await updateTreasuryRun(run.id, {
        status: 'completed',
        executedAmountUsdc: plan.amountBrl,
        binanceWithdrawId: payout.providerTxId || payout.e2eId || null,
        steps: [
          ...run.steps,
          step(
            'read_binance_order_detail',
            'ok',
            polledPayment ? 'pix_key_found' : 'emv_missing_used_fallback_key',
          ),
          step(
            'corpx_pix_out',
            'ok',
            `providerTxId=${payout.providerTxId} e2e=${payout.e2eId} status=${payout.status}`,
          ),
          step('binance_settlement_probe', 'ok', describeSettlementProbe(settlement)),
        ],
        error: null,
      });

      return {
        dryRun: false,
        plan,
        run,
        binanceOrder: {
          orderId: deposit.orderId,
          detail: settlement.detail ?? detail,
          emvFound: false,
          settled: settlement.paid,
        },
      };
    }

    throw new Error(formatMissingPixError(deposit.orderId, detail));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    run = await updateTreasuryRun(run.id, {
      status: 'failed',
      steps: [...run.steps, step('corpx_brl_to_binance', 'failed', reason)],
      error: reason,
    });
    throw new Error(reason);
  }
}
