import { floorBrlWalletAmount, normalizeBrlAmount } from './brl-amount';

/** Off until smoke in production. True only for "1" / "true" (case-insensitive). */
export function isTreasuryOnrampBrlCloseEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.TREASURY_ONRAMP_BRL_CLOSE_ENABLED?.trim().toLowerCase();
  return raw === '1' || raw === 'true';
}

export type OnrampBrlCloseAmountInput = {
  binanceOrderId?: string | null;
  binanceCummulativeQuoteQty?: string | null;
  amountBrl?: string | null;
};

/**
 * BRL to send CorpX → Binance: fill quote qty (what Binance spent), floored to 2 decimals.
 * Requires a BUY order id. Does not fall back to the quoted amount_brl.
 */
export function resolveOnrampBrlCloseAmount(input: OnrampBrlCloseAmountInput): string {
  if (!input.binanceOrderId?.trim()) {
    throw new Error('On-ramp BRL close requires a filled Binance BUY (binance_order_id).');
  }

  const rawFill = input.binanceCummulativeQuoteQty?.trim();
  if (!rawFill) {
    throw new Error(
      'On-ramp BRL close requires binance_cummulative_quote_qty from the BUY fill.',
    );
  }

  const floored = floorBrlWalletAmount(rawFill, 'binance_cummulative_quote_qty');
  const amount = normalizeBrlAmount(floored, 'binance_cummulative_quote_qty');
  if (Number(amount) < 1) {
    throw new Error(
      `On-ramp BRL close amount (${amount}) is below the 1 BRL treasury minimum.`,
    );
  }
  return amount;
}
