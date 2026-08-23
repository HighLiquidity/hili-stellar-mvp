import '@/lib/server/only';

import type { OnrampOrderRow } from '@/lib/onramp/order-store';
import { findOnrampOrderById, updateOnrampOrder } from '@/lib/onramp/order-store';
import { runTreasuryCorpxBrlToBinance } from '@/lib/treasury/brl-transfer';
import {
  isTreasuryOnrampBrlCloseEnabled,
  resolveOnrampBrlCloseAmount,
} from '@/lib/treasury/onramp-brl-close-amount';
import {
  findTreasuryRunBySourceOnrampOrderId,
  listRecentTreasuryRunsByKind,
  updateTreasuryRun,
} from '@/lib/treasury/runs-store';
import type { TreasuryRunRow } from '@/lib/treasury/run-types';

const ONRAMP_CLOSE_STATUSES = [
  'usdc_delivered',
  'needs_review',
  'fx_settled',
  'brh_redeemed',
  'complete',
] as const;

export type OnrampBrlCloseResult = {
  skipped?: string;
  run?: TreasuryRunRow;
};

function isUniqueSourceViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: string; message?: string };
  if (record.code === '23505') return true;
  return /treasury_runs_onramp_brl_close_uidx/i.test(record.message ?? '');
}

async function persistCloseIds(orderId: string, run: TreasuryRunRow): Promise<void> {
  const fiatOrderId = run.binance_withdraw_order_id;
  const updated = await updateOnrampOrder({
    orderId,
    expectedStatus: [...ONRAMP_CLOSE_STATUSES],
    patch: {
      treasury_brl_close_run_id: run.id,
      ...(fiatOrderId ? { treasury_brl_close_fiat_order_id: fiatOrderId } : {}),
    },
  });
  if (!updated.ok) {
    console.warn('[treasury/onramp-brl-close] failed to persist close ids on on-ramp order', {
      orderId,
      runId: run.id,
      reason: updated.reason,
    });
  }
}

async function isOtherBrlTransferRunning(existingRunId: string | null): Promise<boolean> {
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const runs = await listRecentTreasuryRunsByKind({
    kind: 'corpx_brl_to_binance',
    sinceIso: since,
    limit: 50,
  });
  return runs.some((run) => run.status === 'running' && run.id !== existingRunId);
}

/**
 * After a filled on-ramp BUY, pay Binance the BRL it spent (CorpX PIX on the order QR).
 * Never throws: failures stay on the treasury run and must not fail the customer order.
 */
export async function startOnrampBrlClose(order: OnrampOrderRow): Promise<OnrampBrlCloseResult> {
  if (!isTreasuryOnrampBrlCloseEnabled()) {
    return { skipped: 'flag_off' };
  }

  if (!order.binance_order_id?.trim()) {
    return { skipped: 'buy_not_filled' };
  }

  let amountBrl: string;
  try {
    amountBrl = resolveOnrampBrlCloseAmount({
      binanceOrderId: order.binance_order_id,
      binanceCummulativeQuoteQty: order.binance_cummulative_quote_qty,
    });
  } catch (error) {
    console.warn('[treasury/onramp-brl-close] skipped: cannot resolve amount', {
      orderId: order.id,
      reason: error instanceof Error ? error.message : String(error),
    });
    return { skipped: 'amount' };
  }

  const existingRun = await findTreasuryRunBySourceOnrampOrderId(order.id);
  if (existingRun) {
    if (
      existingRun.status === 'pending' ||
      existingRun.status === 'running' ||
      existingRun.status === 'completed'
    ) {
      await persistCloseIds(order.id, existingRun);
      return { skipped: `existing_${existingRun.status}`, run: existingRun };
    }

    if (existingRun.status === 'failed' && existingRun.binance_withdraw_order_id) {
      await persistCloseIds(order.id, existingRun);
      console.warn(
        '[treasury/onramp-brl-close] existing failed run already created a fiat deposit; not retrying',
        {
          orderId: order.id,
          runId: existingRun.id,
          fiatOrderId: existingRun.binance_withdraw_order_id,
        },
      );
      return { skipped: 'existing_failed_with_deposit', run: existingRun };
    }

    if (existingRun.status === 'failed' && !existingRun.binance_withdraw_order_id) {
      await updateTreasuryRun(existingRun.id, { sourceOnrampOrderId: null });
    }
  }

  if (await isOtherBrlTransferRunning(existingRun?.id ?? null)) {
    console.warn('[treasury/onramp-brl-close] skipped: another CorpX→Binance PIX is running', {
      orderId: order.id,
    });
    return { skipped: 'in_flight_lock' };
  }

  try {
    const result = await runTreasuryCorpxBrlToBinance({
      dryRun: false,
      amountBrl,
      trigger: 'onramp',
      sourceOnrampOrderId: order.id,
    });
    await persistCloseIds(order.id, result.run);
    console.info('[treasury/onramp-brl-close] submitted', {
      orderId: order.id,
      runId: result.run.id,
      amountBrl,
      fiatOrderId: result.run.binance_withdraw_order_id,
      pixInFlight: result.binanceOrder?.pixInFlight ?? false,
    });
    return { run: result.run };
  } catch (error) {
    if (isUniqueSourceViolation(error)) {
      const raced = await findTreasuryRunBySourceOnrampOrderId(order.id);
      if (raced) {
        await persistCloseIds(order.id, raced);
        return { skipped: 'unique_race', run: raced };
      }
    }

    console.error('[treasury/onramp-brl-close] failed', {
      orderId: order.id,
      amountBrl,
      reason: error instanceof Error ? error.message : String(error),
    });

    const leftover = await findTreasuryRunBySourceOnrampOrderId(order.id);
    if (leftover) {
      await persistCloseIds(order.id, leftover);
      return { skipped: 'execute_failed', run: leftover };
    }

    return { skipped: 'execute_failed' };
  }
}

/** Reloads the order so close uses the latest fill snapshot. */
export async function startOnrampBrlCloseForOrderId(orderId: string): Promise<OnrampBrlCloseResult> {
  if (!isTreasuryOnrampBrlCloseEnabled()) {
    return { skipped: 'flag_off' };
  }
  const latest = await findOnrampOrderById(orderId);
  if (!latest) {
    return { skipped: 'order_not_found' };
  }
  return startOnrampBrlClose(latest);
}
