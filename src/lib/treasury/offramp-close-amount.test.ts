import { describe, expect, it } from 'vitest';

import {
  isTreasuryOfframpBrlCloseEnabled,
  isTreasuryOfframpUsdcCloseEnabled,
  resolveOfframpBrlCloseAmount,
  resolveOfframpUsdcCloseAmount,
} from './offramp-close-amount';

describe('isTreasuryOfframpUsdcCloseEnabled', () => {
  it('is off by default', () => {
    expect(isTreasuryOfframpUsdcCloseEnabled({})).toBe(false);
    expect(isTreasuryOfframpUsdcCloseEnabled({ TREASURY_OFFRAMP_USDC_CLOSE_ENABLED: '' })).toBe(
      false,
    );
    expect(isTreasuryOfframpUsdcCloseEnabled({ TREASURY_OFFRAMP_USDC_CLOSE_ENABLED: 'false' })).toBe(
      false,
    );
  });

  it('turns on for true or 1', () => {
    expect(isTreasuryOfframpUsdcCloseEnabled({ TREASURY_OFFRAMP_USDC_CLOSE_ENABLED: 'true' })).toBe(
      true,
    );
    expect(isTreasuryOfframpUsdcCloseEnabled({ TREASURY_OFFRAMP_USDC_CLOSE_ENABLED: '1' })).toBe(
      true,
    );
  });
});

describe('isTreasuryOfframpBrlCloseEnabled', () => {
  it('is off by default', () => {
    expect(isTreasuryOfframpBrlCloseEnabled({})).toBe(false);
    expect(isTreasuryOfframpBrlCloseEnabled({ TREASURY_OFFRAMP_BRL_CLOSE_ENABLED: 'false' })).toBe(
      false,
    );
  });

  it('turns on for true or 1', () => {
    expect(isTreasuryOfframpBrlCloseEnabled({ TREASURY_OFFRAMP_BRL_CLOSE_ENABLED: 'TRUE' })).toBe(
      true,
    );
    expect(isTreasuryOfframpBrlCloseEnabled({ TREASURY_OFFRAMP_BRL_CLOSE_ENABLED: '1' })).toBe(true);
  });
});

describe('resolveOfframpUsdcCloseAmount', () => {
  it('requires a filled SELL', () => {
    expect(() =>
      resolveOfframpUsdcCloseAmount({
        binanceExecutedQty: '18.22681850',
      }),
    ).toThrow(/binance_order_id/);
  });

  it('requires executed qty and does not fall back to usdc_received_amount', () => {
    expect(() =>
      resolveOfframpUsdcCloseAmount({
        binanceOrderId: '99',
        usdcReceivedAmount: '18.22',
      }),
    ).toThrow(/executed_qty/);
  });

  it('truncates Binance 8-decimal fill qty to Stellar 7 decimals', () => {
    expect(
      resolveOfframpUsdcCloseAmount({
        binanceOrderId: '99',
        binanceExecutedQty: '18.22681850',
      }),
    ).toBe('18.2268185');
  });

  it('rejects fills below the drain minimum', () => {
    expect(() =>
      resolveOfframpUsdcCloseAmount({
        binanceOrderId: '99',
        binanceExecutedQty: '0.50',
      }),
    ).toThrow(/at least/i);
  });
});

describe('resolveOfframpBrlCloseAmount', () => {
  it('requires a filled SELL', () => {
    expect(() =>
      resolveOfframpBrlCloseAmount({
        binanceCummulativeQuoteQty: '100.12',
      }),
    ).toThrow(/binance_order_id/);
  });

  it('requires the fill quote qty and does not fall back to amount_brl', () => {
    expect(() =>
      resolveOfframpBrlCloseAmount({
        binanceOrderId: '99',
        amountBrl: '100.00',
      }),
    ).toThrow(/cummulative_quote_qty/);
  });

  it('floors Binance 8-decimal fill qty to 2 BRL decimals', () => {
    expect(
      resolveOfframpBrlCloseAmount({
        binanceOrderId: '99',
        binanceCummulativeQuoteQty: '100.12999999',
      }),
    ).toBe('100.12');
  });

  it('rejects fills below 1 BRL', () => {
    expect(() =>
      resolveOfframpBrlCloseAmount({
        binanceOrderId: '99',
        binanceCummulativeQuoteQty: '0.50',
      }),
    ).toThrow(/1 BRL/);
  });
});
