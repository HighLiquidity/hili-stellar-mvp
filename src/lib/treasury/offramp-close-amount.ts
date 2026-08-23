import { normalizeBinanceUsdcAmount } from '@/lib/onramp/binance-withdraw-min';

import { floorBrlWalletAmount, normalizeBrlAmount } from './brl-amount';
import { resolveTreasuryUsdcDrainAmount } from './drain-amount';

/** Stellar USDC scale used by the treasury drain (Ramp onramp). */
const STELLAR_USDC_SCALE = 7;

/** Off until smoke. True only for "1" / "true" (case-insensitive). */
export function isTreasuryOfframpUsdcCloseEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env.TREASURY_OFFRAMP_USDC_CLOSE_ENABLED?.trim().toLowerCase();
  return raw === '1' || raw === 'true';
}

/** Off until smoke. True only for "1" / "true" (case-insensitive). */
export function isTreasuryOfframpBrlCloseEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env.TREASURY_OFFRAMP_BRL_CLOSE_ENABLED?.trim().toLowerCase();
  return raw === '1' || raw === 'true';
}

export type OfframpUsdcCloseAmountInput = {
  binanceOrderId?: string | null;
  binanceExecutedQty?: string | null;
  usdcReceivedAmount?: string | null;
};

export type OfframpBrlCloseAmountInput = {
  binanceOrderId?: string | null;
  binanceCummulativeQuoteQty?: string | null;
  amountBrl?: string | null;
};

/**
 * USDC to drain distributor → Binance: fill executed qty (what the SELL sold).
 * Truncates to Stellar/Ramp scale. Does not fall back to usdc_received_amount.
 */
export function resolveOfframpUsdcCloseAmount(input: OfframpUsdcCloseAmountInput): string {
  if (!input.binanceOrderId?.trim()) {
    throw new Error('Off-ramp USDC close requires a filled Binance SELL (binance_order_id).');
  }

  const rawFill = input.binanceExecutedQty?.trim();
  if (!rawFill) {
    throw new Error('Off-ramp USDC close requires binance_executed_qty from the SELL fill.');
  }

  const amount = normalizeBinanceUsdcAmount(rawFill, 'binance_executed_qty', STELLAR_USDC_SCALE);
  return resolveTreasuryUsdcDrainAmount({
    requestedAmount: amount,
    distributorUsdc: amount,
  });
}

/**
 * BRL to send Binance → CorpX: fill quote qty (what the SELL obtained), floored to 2 decimals.
 * Requires a SELL order id. Does not fall back to the quoted amount_brl.
 */
export function resolveOfframpBrlCloseAmount(input: OfframpBrlCloseAmountInput): string {
  if (!input.binanceOrderId?.trim()) {
    throw new Error('Off-ramp BRL close requires a filled Binance SELL (binance_order_id).');
  }

  const rawFill = input.binanceCummulativeQuoteQty?.trim();
  if (!rawFill) {
    throw new Error(
      'Off-ramp BRL close requires binance_cummulative_quote_qty from the SELL fill.',
    );
  }

  const floored = floorBrlWalletAmount(rawFill, 'binance_cummulative_quote_qty');
  const amount = normalizeBrlAmount(floored, 'binance_cummulative_quote_qty');
  if (Number(amount) < 1) {
    throw new Error(
      `Off-ramp BRL close amount (${amount}) is below the 1 BRL treasury minimum.`,
    );
  }
  return amount;
}
