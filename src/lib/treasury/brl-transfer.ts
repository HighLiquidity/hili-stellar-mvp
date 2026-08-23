import '@/lib/server/only';

import { createCorpXAdapterFromEnv } from '@/lib/corpx/adapter';
import { CorpXTransactionNotFoundError } from '@/lib/corpx/errors';
import { normalizeCorpXPixIdentifier } from '@/lib/corpx/pix/identifier';
import type { PIXCashOutResponse, TransferStatus } from '@/lib/corpx/pix/types';
import { binance } from '@/lib/server/binance';

import { projectCorpxBrlToBinanceBalances, resolveTreasuryBrlAmount } from './brl-amount';
import {
  amountForEmvPayout,
  assertCorpXPixOutAccepted,
  BINANCE_FIAT_PIX_POLL_MAX_MS,
  BINANCE_FIAT_PIX_POLL_MS,
  BINANCE_FIAT_SETTLEMENT_POLL_MS,
  classifyTreasuryPixOutOutcome,
  describeSettlementProbe,
  formatMissingPixError,
  isBinanceFiatOrderFailed,
  isBinanceFiatOrderPaid,
  readFiatOrderStatus,
  resolvePixPaymentFromOrderDetail,
  throwIfTreasuryPixOutUnresolved,
  TREASURY_PIX_ARRIVAL_POLL_MAX_MS,
  type ResolvedPixPayment,
  type SettlementProbeResult,
  type TreasuryPixOutOutcome,
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

/** PIX campo livre. ASCII hyphen — BACEN rejects the unicode arrow `→`. */
export function treasuryCorpxToBinancePixDescription(runId: string): string {
  return `Treasury BRL-Binance ${runId}`;
}

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

type PixLookupClient = {
  lookupPixOutStatus?: (query: {
    endToEndId?: string;
    identifier?: string;
  }) => Promise<TransferStatus>;
  lookupPixPayment: (query: {
    endToEndId?: string;
    identifier?: string;
  }) => Promise<TransferStatus>;
};

async function lookupTreasuryPix(
  pix: PixLookupClient,
  query: { endToEndId?: string; identifier?: string },
): Promise<TransferStatus> {
  if (pix.lookupPixOutStatus) {
    return pix.lookupPixOutStatus(query);
  }
  return pix.lookupPixPayment(query);
}

async function waitForTreasuryPixArrival(input: {
  pix: PixLookupClient;
  e2eId?: string;
  identifier: string;
  binanceOrderId: string;
}): Promise<{ corpx: TransferStatus; binance: SettlementProbeResult }> {
  const deadline = Date.now() + TREASURY_PIX_ARRIVAL_POLL_MAX_MS;
  let last: TransferStatus = {
    providerTxId: '',
    e2eId: input.e2eId?.trim() ?? '',
    status: 'pending',
    updatedAt: nowIso(),
  };
  let binanceProbe: SettlementProbeResult = { detail: null, paid: false, status: '' };

  while (Date.now() <= deadline) {
    try {
      const e2e = last.e2eId.trim() || input.e2eId?.trim() || '';
      if (e2e) {
        last = await lookupTreasuryPix(input.pix, { endToEndId: e2e });
      } else {
        last = await lookupTreasuryPix(input.pix, { identifier: input.identifier });
      }
    } catch (error) {
      if (!(error instanceof CorpXTransactionNotFoundError)) {
        throw error;
      }
      try {
        last = await lookupTreasuryPix(input.pix, { identifier: input.identifier });
      } catch (inner) {
        if (!(inner instanceof CorpXTransactionNotFoundError)) {
          throw inner;
        }
      }
    }

    const detail = await binance.fiat.getOrderDetail(input.binanceOrderId);
    throwIfBinanceOrderFailed(input.binanceOrderId, detail);
    binanceProbe = {
      detail,
      paid: isBinanceFiatOrderPaid(detail),
      status: readFiatOrderStatus(detail),
    };

    if (last.status === 'completed' || last.status === 'failed' || binanceProbe.paid) {
      return { corpx: last, binance: binanceProbe };
    }

    if (Date.now() + BINANCE_FIAT_SETTLEMENT_POLL_MS > deadline) {
      break;
    }
    await sleep(BINANCE_FIAT_SETTLEMENT_POLL_MS);
  }

  return { corpx: last, binance: binanceProbe };
}

async function completeTreasuryCorpxPixToBinance(input: {
  pix: PixLookupClient;
  run: TreasuryRunRow;
  plan: TreasuryBrlTransferPlan;
  payout: PIXCashOutResponse;
  identifier: string;
  depositOrderId: string;
  initialDetail: unknown;
  emvFound: boolean;
  detailStep: string;
}): Promise<{
  run: TreasuryRunRow;
  binanceOrder: {
    orderId: string;
    detail: unknown;
    emvFound: boolean;
    settled?: boolean;
    pixInFlight?: boolean;
  };
}> {
  const arrival = await waitForTreasuryPixArrival({
    pix: input.pix,
    e2eId: input.payout.e2eId,
    identifier: input.identifier,
    binanceOrderId: input.depositOrderId,
  });
  const e2e = arrival.corpx.e2eId || input.payout.e2eId;
  const outcome: TreasuryPixOutOutcome = classifyTreasuryPixOutOutcome({
    corpxStatus: arrival.corpx.status,
    e2eId: e2e,
    binancePaid: arrival.binance.paid,
  });
  throwIfTreasuryPixOutUnresolved(
    outcome,
    `identifier=${input.identifier} e2e=${e2e || ''} providerTxId=${arrival.corpx.providerTxId || input.payout.providerTxId}`,
  );

  const run = await updateTreasuryRun(input.run.id, {
    status: 'completed',
    executedAmountUsdc: input.plan.amountBrl,
    binanceWithdrawId: input.payout.providerTxId || e2e || arrival.corpx.providerTxId || null,
    steps: [
      ...input.run.steps,
      step('read_binance_order_detail', 'ok', input.detailStep),
      step(
        'corpx_pix_out',
        'ok',
        `providerTxId=${input.payout.providerTxId} e2e=${input.payout.e2eId} submit=${input.payout.status}`,
      ),
      step(
        'corpx_pix_settlement',
        'ok',
        `outcome=${outcome} status=${arrival.corpx.status} e2e=${e2e}`,
      ),
      step('binance_settlement_probe', 'ok', describeSettlementProbe(arrival.binance)),
    ],
    error: null,
  });

  return {
    run,
    binanceOrder: {
      orderId: input.depositOrderId,
      detail: arrival.binance.detail ?? input.initialDetail,
      emvFound: input.emvFound,
      settled: outcome === 'settled' && arrival.binance.paid,
      pixInFlight: outcome === 'in_flight',
    },
  };
}

function throwIfBinanceOrderFailed(orderId: string, detail: unknown): void {
  if (!isBinanceFiatOrderFailed(detail)) return;
  throw new Error(
    `Binance fiat deposit order ${orderId} failed. ${summarizeFiatOrderDetail(detail)}`,
  );
}

/** Wait for the Binance order QR/copia-e-cola (EMV). A decoded PIX key does not identify the cobranca. */
async function waitForBinanceFiatPixPayment(
  orderId: string,
): Promise<{ detail: unknown; payment: ResolvedPixPayment | null }> {
  const deadline = Date.now() + BINANCE_FIAT_PIX_POLL_MAX_MS;
  let detail: unknown = null;

  while (Date.now() <= deadline) {
    detail = await binance.fiat.getOrderDetail(orderId);
    throwIfBinanceOrderFailed(orderId, detail);

    const payment = resolvePixPaymentFromOrderDetail(detail);
    if (payment?.mode === 'emv') {
      return { detail, payment };
    }

    if (Date.now() + BINANCE_FIAT_PIX_POLL_MS > deadline) {
      break;
    }
    await sleep(BINANCE_FIAT_PIX_POLL_MS);
  }

  return { detail, payment: null };
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

  const projection = projectCorpxBrlToBinanceBalances({
    amountBrl,
    corpxAvailable: balance.available,
    binanceBrlFree,
  });

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
    corpxBrlAfter: projection.corpxBrlAfter,
    binanceBrlAfter: projection.binanceBrlAfter,
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
    /** PIX is in SPI (BACEN E2E) but CorpX lookup is still PROCESSING. Do not retry. */
    pixInFlight?: boolean;
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
      sourceOnrampOrderId: input.sourceOnrampOrderId ?? null,
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
    sourceOnrampOrderId: input.sourceOnrampOrderId ?? null,
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

    const { detail, payment } = await waitForBinanceFiatPixPayment(deposit.orderId);
    const adapter = await createCorpXAdapterFromEnv();
    const idempotencyKey = `treasury-brl-${run.id}`;

    if (payment?.mode === 'emv') {
      const identifier = normalizeCorpXPixIdentifier(run.id);
      const amountBrl = amountForEmvPayout(payment.emv, plan.amountBrl);
      const detailStep = `emv_found status=${readFiatOrderStatus(detail) || 'unknown'} paid_via=qr_async`;

      const payout = await adapter.pix.payPaymentQrEmv({
        emv: payment.emv,
        amount: amountBrl,
        amountHint: plan.amountBrl,
        description: treasuryCorpxToBinancePixDescription(run.id),
        idempotencyKey,
        correlationId: run.id,
      });

      assertCorpXPixOutAccepted(payout);

      const finished = await completeTreasuryCorpxPixToBinance({
        pix: adapter.pix,
        run,
        plan,
        payout,
        identifier,
        depositOrderId: deposit.orderId,
        initialDetail: detail,
        emvFound: true,
        detailStep,
      });

      return {
        dryRun: false,
        plan,
        run: finished.run,
        binanceOrder: finished.binanceOrder,
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
