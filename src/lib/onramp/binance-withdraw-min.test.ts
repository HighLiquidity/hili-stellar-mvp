import { describe, expect, it } from 'vitest';

import {
  assertUsdcMeetsBinanceMinWithdraw,
  DEFAULT_ONRAMP_BINANCE_MIN_WITHDRAW_USDC,
  normalizeBinanceUsdcAmount,
} from './binance-withdraw-min';

describe('onramp Binance minimum withdraw', () => {
  it('defaults to 5 USDC', () => {
    expect(DEFAULT_ONRAMP_BINANCE_MIN_WITHDRAW_USDC).toBe('5');
  });

  it('accepts amounts at or above the Binance minimum', () => {
    expect(() => assertUsdcMeetsBinanceMinWithdraw('5')).not.toThrow();
    expect(() => assertUsdcMeetsBinanceMinWithdraw('18.2268185')).not.toThrow();
  });

  it('rejects amounts below the Binance minimum', () => {
    expect(() => assertUsdcMeetsBinanceMinWithdraw('4.9999999')).toThrowError(
      /at least 5 USDC to satisfy the Binance minimum withdraw/,
    );
  });

  it('normalizes Binance executed qty with extra decimal places', () => {
    expect(normalizeBinanceUsdcAmount('18.22681850', 'binance_executed_qty')).toBe('18.2268185');
    expect(() =>
      assertUsdcMeetsBinanceMinWithdraw('18.22681850', 'binance_executed_qty'),
    ).not.toThrow();
  });
});
