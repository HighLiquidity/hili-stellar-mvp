import { describe, expect, it } from 'vitest';

import {
  isTreasuryOnrampBrlCloseEnabled,
  resolveOnrampBrlCloseAmount,
} from './onramp-brl-close-amount';

describe('isTreasuryOnrampBrlCloseEnabled', () => {
  it('is off by default', () => {
    expect(isTreasuryOnrampBrlCloseEnabled({})).toBe(false);
    expect(isTreasuryOnrampBrlCloseEnabled({ TREASURY_ONRAMP_BRL_CLOSE_ENABLED: '' })).toBe(false);
    expect(isTreasuryOnrampBrlCloseEnabled({ TREASURY_ONRAMP_BRL_CLOSE_ENABLED: 'false' })).toBe(
      false,
    );
  });

  it('turns on for true or 1', () => {
    expect(isTreasuryOnrampBrlCloseEnabled({ TREASURY_ONRAMP_BRL_CLOSE_ENABLED: 'true' })).toBe(
      true,
    );
    expect(isTreasuryOnrampBrlCloseEnabled({ TREASURY_ONRAMP_BRL_CLOSE_ENABLED: 'TRUE' })).toBe(
      true,
    );
    expect(isTreasuryOnrampBrlCloseEnabled({ TREASURY_ONRAMP_BRL_CLOSE_ENABLED: '1' })).toBe(true);
  });
});

describe('resolveOnrampBrlCloseAmount', () => {
  it('requires a filled BUY', () => {
    expect(() =>
      resolveOnrampBrlCloseAmount({
        binanceCummulativeQuoteQty: '100.12',
      }),
    ).toThrow(/binance_order_id/);
  });

  it('requires the fill quote qty and does not fall back to amount_brl', () => {
    expect(() =>
      resolveOnrampBrlCloseAmount({
        binanceOrderId: '99',
        amountBrl: '100.00',
      }),
    ).toThrow(/cummulative_quote_qty/);
  });

  it('floors Binance 8-decimal fill qty to 2 BRL decimals', () => {
    expect(
      resolveOnrampBrlCloseAmount({
        binanceOrderId: '99',
        binanceCummulativeQuoteQty: '100.12999999',
      }),
    ).toBe('100.12');
  });

  it('rejects fills below 1 BRL', () => {
    expect(() =>
      resolveOnrampBrlCloseAmount({
        binanceOrderId: '99',
        binanceCummulativeQuoteQty: '0.50',
      }),
    ).toThrow(/1 BRL/);
  });
});
