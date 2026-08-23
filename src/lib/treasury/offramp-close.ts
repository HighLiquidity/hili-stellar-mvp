import '@/lib/server/only';

import type { OfframpOrderRow } from '@/lib/offramp/order-store';
import { findOfframpOrderById, updateOfframpOrder } from '@/lib/offramp/order-store';
import { runTreasuryBinanceBrlToCorpx } from '@/lib/treasury/brl-receive';
import {
  isTreasuryOfframpBrlCloseEnabled,
  isTreasuryOfframpUsdcCloseEnabled,
  resolveOfframpBrlCloseAmount,
  resolveOfframpUsdcCloseAmount,
} from '@/lib/treasury/offramp-close-amount';
import {
  findTreasuryRunBySourceOfframpOrderId,
  listRecentTreasuryRunsByKind,
  updateTreasuryRun,
} from '@/lib/treasury/runs-store';
import type { TreasuryRunKind, TreasuryRunRow } from '@/lib/treasury/run-types';
import { runTreasuryDistributorUsdcToBinance } from '@/lib/treasury/usdc-drain';

const OFFRAMP_CLOSE_STATUSES = [
  'usdc_received',
  'needs_review',
  'pix_sent',
  'brh_recorded',
  'fx_settled',
  'complete',
] as const;

export type OfframpCloseResult = {
  skipped?: string;
  usdc?: { skipped?: string; run?: TreasuryRunRow };
  brl?: { skipped?: string; run?: TreasuryRunRow };
};

type RailCloseResult = {
  skipped?: string;
  run?: TreasuryRunRow;
};

function isUniqueSourceViolation(error: unknown, indexName: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: string; message?: string };
  if (record.code === '23505') return true;
  return new RegExp(indexName, 'i').test(record.message ?? '');
}

async function persistUsdcCloseIds(orderId: string, run: TreasuryRunRow): Promise<void> {
  const externalId = run.binance_withdraw_order_id;
  const updated = await updateOfframpOrder({
    orderId,
    expectedStatus: [...OFFRAMP_CLOSE_STATUSES],
    patch: {
      treasury_usdc_close_run_id: run.id,
      ...(externalId ? { treasury_usdc_close_external_id: externalId } : {}),
    },
  });
  if (!updated.ok) {
    console.warn('[treasury/offramp-close] failed to persist USDC close ids on off-ramp order', {
      orderId,
      runId: run.id,
      reason: updated.reason,
    });
  }
}

async function persistBrlCloseIds(orderId: string, run: TreasuryRunRow): Promise<void> {
  const fiatOrderId = run.binance_withdraw_order_id;
  const updated = await updateOfframpOrder({
    orderId,
    expectedStatus: [...OFFRAMP_CLOSE_STATUSES],
    patch: {
      treasury_brl_close_run_id: run.id,
      ...(fiatOrderId ? { treasury_brl_close_fiat_order_id: fiatOrderId } : {}),
    },
  });
  if (!updated.ok) {
    console.warn('[treasury/offramp-close] failed to persist BRL close ids on off-ramp order', {
      orderId,
      runId: run.id,
      reason: updated.reason,
    });
  }
}

async function isOtherKindRunning(
  kind: TreasuryRunKind,
  existingRunId: string | null,
): Promise<boolean> {
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const runs = await listRecentTreasuryRunsByKind({
    kind,
    sinceIso: since,
    limit: 50,
  });
  return runs.some((run) => run.status === 'running' && run.id !== existingRunId);
}

async function resumeOrClearExisting(input: {
  existingRun: TreasuryRunRow | null;
  orderId: string;
  persist: (run: TreasuryRunRow) => Promise<void>;
  logPrefix: string;
  inFlightLabel: string;
}): Promise<RailCloseResult | null> {
  const { existingRun, orderId, persist, logPrefix, inFlightLabel } = input;
  if (!existingRun) return null;

  if (
    existingRun.status === 'pending' ||
    existingRun.status === 'running' ||
    existingRun.status === 'completed'
  ) {
    await persist(existingRun);
    return { skipped: `existing_${existingRun.status}`, run: existingRun };
  }

  if (existingRun.status === 'failed' && existingRun.binance_withdraw_order_id) {
    await persist(existingRun);
    console.warn(
      `${logPrefix} existing failed run already submitted ${inFlightLabel}; not retrying`,
      {
        orderId,
        runId: existingRun.id,
        submittedId: existingRun.binance_withdraw_order_id,
      },
    );
    return { skipped: 'existing_failed_with_submit', run: existingRun };
  }

  if (existingRun.status === 'failed' && !existingRun.binance_withdraw_order_id) {
    await updateTreasuryRun(existingRun.id, { sourceOfframpOrderId: null });
  }

  return null;
}

async function startOfframpUsdcClose(order: OfframpOrderRow): Promise<RailCloseResult> {
  if (!isTreasuryOfframpUsdcCloseEnabled()) {
    return { skipped: 'flag_off' };
  }

  if (!order.binance_order_id?.trim()) {
    return { skipped: 'sell_not_filled' };
  }

  let amountUsdc: string;
  try {
    amountUsdc = resolveOfframpUsdcCloseAmount({
      binanceOrderId: order.binance_order_id,
      binanceExecutedQty: order.binance_executed_qty,
    });
  } catch (error) {
    console.warn('[treasury/offramp-usdc-close] skipped: cannot resolve amount', {
      orderId: order.id,
      reason: error instanceof Error ? error.message : String(error),
    });
    return { skipped: 'amount' };
  }

  const existingRun = await findTreasuryRunBySourceOfframpOrderId(
    order.id,
    'distributor_usdc_to_binance',
  );
  const resumed = await resumeOrClearExisting({
    existingRun,
    orderId: order.id,
    persist: (run) => persistUsdcCloseIds(order.id, run),
    logPrefix: '[treasury/offramp-usdc-close]',
    inFlightLabel: 'Ramp drain',
  });
  if (resumed) return resumed;

  if (await isOtherKindRunning('distributor_usdc_to_binance', existingRun?.id ?? null)) {
    console.warn('[treasury/offramp-usdc-close] skipped: another USDC drain is running', {
      orderId: order.id,
    });
    return { skipped: 'in_flight_lock' };
  }

  try {
    const result = await runTreasuryDistributorUsdcToBinance({
      dryRun: false,
      amount: amountUsdc,
      trigger: 'offramp',
      sourceOfframpOrderId: order.id,
    });
    await persistUsdcCloseIds(order.id, result.run);
    console.info('[treasury/offramp-usdc-close] submitted', {
      orderId: order.id,
      runId: result.run.id,
      amountUsdc,
      externalId: result.run.binance_withdraw_order_id,
      rampOperationId: result.run.binance_withdraw_id,
    });
    return { run: result.run };
  } catch (error) {
    if (isUniqueSourceViolation(error, 'treasury_runs_offramp_usdc_close_uidx')) {
      const raced = await findTreasuryRunBySourceOfframpOrderId(
        order.id,
        'distributor_usdc_to_binance',
      );
      if (raced) {
        await persistUsdcCloseIds(order.id, raced);
        return { skipped: 'unique_race', run: raced };
      }
    }

    console.error('[treasury/offramp-usdc-close] failed', {
      orderId: order.id,
      amountUsdc,
      reason: error instanceof Error ? error.message : String(error),
    });

    const leftover = await findTreasuryRunBySourceOfframpOrderId(
      order.id,
      'distributor_usdc_to_binance',
    );
    if (leftover) {
      await persistUsdcCloseIds(order.id, leftover);
      return { skipped: 'execute_failed', run: leftover };
    }

    return { skipped: 'execute_failed' };
  }
}

async function startOfframpBrlClose(order: OfframpOrderRow): Promise<RailCloseResult> {
  if (!isTreasuryOfframpBrlCloseEnabled()) {
    return { skipped: 'flag_off' };
  }

  if (!order.binance_order_id?.trim()) {
    return { skipped: 'sell_not_filled' };
  }

  let amountBrl: string;
  try {
    amountBrl = resolveOfframpBrlCloseAmount({
      binanceOrderId: order.binance_order_id,
      binanceCummulativeQuoteQty: order.binance_cummulative_quote_qty,
    });
  } catch (error) {
    console.warn('[treasury/offramp-brl-close] skipped: cannot resolve amount', {
      orderId: order.id,
      reason: error instanceof Error ? error.message : String(error),
    });
    return { skipped: 'amount' };
  }

  const existingRun = await findTreasuryRunBySourceOfframpOrderId(order.id, 'binance_brl_to_corpx');
  const resumed = await resumeOrClearExisting({
    existingRun,
    orderId: order.id,
    persist: (run) => persistBrlCloseIds(order.id, run),
    logPrefix: '[treasury/offramp-brl-close]',
    inFlightLabel: 'fiat withdraw',
  });
  if (resumed) return resumed;

  if (await isOtherKindRunning('binance_brl_to_corpx', existingRun?.id ?? null)) {
    console.warn('[treasury/offramp-brl-close] skipped: another Binance→CorpX withdraw is running', {
      orderId: order.id,
    });
    return { skipped: 'in_flight_lock' };
  }

  try {
    const result = await runTreasuryBinanceBrlToCorpx({
      dryRun: false,
      amountBrl,
      trigger: 'offramp',
      sourceOfframpOrderId: order.id,
    });
    await persistBrlCloseIds(order.id, result.run);
    console.info('[treasury/offramp-brl-close] submitted', {
      orderId: order.id,
      runId: result.run.id,
      amountBrl,
      fiatOrderId: result.run.binance_withdraw_order_id,
      settled: result.binanceOrder?.settled ?? false,
    });
    return { run: result.run };
  } catch (error) {
    if (isUniqueSourceViolation(error, 'treasury_runs_offramp_brl_close_uidx')) {
      const raced = await findTreasuryRunBySourceOfframpOrderId(order.id, 'binance_brl_to_corpx');
      if (raced) {
        await persistBrlCloseIds(order.id, raced);
        return { skipped: 'unique_race', run: raced };
      }
    }

    console.error('[treasury/offramp-brl-close] failed', {
      orderId: order.id,
      amountBrl,
      reason: error instanceof Error ? error.message : String(error),
    });

    const leftover = await findTreasuryRunBySourceOfframpOrderId(order.id, 'binance_brl_to_corpx');
    if (leftover) {
      await persistBrlCloseIds(order.id, leftover);
      return { skipped: 'execute_failed', run: leftover };
    }

    return { skipped: 'execute_failed' };
  }
}

/**
 * After a filled off-ramp SELL, drain USDC distributor → Binance and send BRL Binance → CorpX.
 * Never throws: failures stay on the treasury runs and must not fail the customer order.
 * Rails are independent (separate flags); one failure does not retract the other.
 */
export async function startOfframpTreasuryClose(order: OfframpOrderRow): Promise<OfframpCloseResult> {
  const usdcEnabled = isTreasuryOfframpUsdcCloseEnabled();
  const brlEnabled = isTreasuryOfframpBrlCloseEnabled();
  if (!usdcEnabled && !brlEnabled) {
    return { skipped: 'flag_off' };
  }

  const [usdc, brl] = await Promise.all([
    usdcEnabled ? startOfframpUsdcClose(order) : Promise.resolve({ skipped: 'flag_off' }),
    brlEnabled ? startOfframpBrlClose(order) : Promise.resolve({ skipped: 'flag_off' }),
  ]);

  return { usdc, brl };
}

/** Reloads the order so close uses the latest fill snapshot. */
export async function startOfframpTreasuryCloseForOrderId(
  orderId: string,
): Promise<OfframpCloseResult> {
  if (!isTreasuryOfframpUsdcCloseEnabled() && !isTreasuryOfframpBrlCloseEnabled()) {
    return { skipped: 'flag_off' };
  }
  const latest = await findOfframpOrderById(orderId);
  if (!latest) {
    return { skipped: 'order_not_found' };
  }
  return startOfframpTreasuryClose(latest);
}
