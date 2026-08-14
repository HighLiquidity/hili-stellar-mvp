import { describe, expect, it } from 'vitest';

import {
  normalizeBrlAmount,
  projectBinanceBrlWithdrawBalances,
  projectCorpxBrlToBinanceBalances,
  resolveTreasuryBinanceBrlWithdrawAmount,
  resolveTreasuryBrlAmount,
} from './brl-amount';

describe('normalizeBrlAmount', () => {
  it('accepts up to 2 decimals', () => {
    expect(normalizeBrlAmount('100.50', 'amount')).toBe('100.5');
    expect(normalizeBrlAmount('30', 'amount')).toBe('30');
  });

  it('rejects more than 2 decimals', () => {
    expect(() => normalizeBrlAmount('10.123', 'amount')).toThrow(/2 decimals/i);
  });
});

describe('resolveTreasuryBrlAmount', () => {
  it('uses full CorpX available when amount omitted', () => {
    expect(
      resolveTreasuryBrlAmount({
        corpxAvailable: '250.00',
      }),
    ).toBe('250');
  });

  it('accepts explicit amount within available', () => {
    expect(
      resolveTreasuryBrlAmount({
        requestedAmountBrl: '30',
        corpxAvailable: '250',
      }),
    ).toBe('30');
  });

  it('rejects amount above available', () => {
    expect(() =>
      resolveTreasuryBrlAmount({
        requestedAmountBrl: '300',
        corpxAvailable: '250',
      }),
    ).toThrow(/exceeds CorpX available/i);
  });

  it('rejects amount below 1 BRL', () => {
    expect(() =>
      resolveTreasuryBrlAmount({
        requestedAmountBrl: '0.5',
        corpxAvailable: '250',
      }),
    ).toThrow(/at least 1 BRL/i);
  });
});

describe('resolveTreasuryBinanceBrlWithdrawAmount', () => {
  it('uses Binance free BRL when amount omitted', () => {
    expect(
      resolveTreasuryBinanceBrlWithdrawAmount({
        binanceBrlFree: '80.00',
      }),
    ).toBe('80');
  });

  it('accepts Binance spot free with 8 decimals', () => {
    expect(
      resolveTreasuryBinanceBrlWithdrawAmount({
        requestedAmountBrl: '10',
        binanceBrlFree: '80.00000000',
      }),
    ).toBe('10');
  });

  it('floors extra wallet decimals instead of rounding up', () => {
    expect(
      resolveTreasuryBinanceBrlWithdrawAmount({
        requestedAmountBrl: '12.34',
        binanceBrlFree: '12.34900000',
      }),
    ).toBe('12.34');
  });

  it('rejects zero Binance free even with 8-decimal padding', () => {
    expect(() =>
      resolveTreasuryBinanceBrlWithdrawAmount({
        binanceBrlFree: '0.00000000',
      }),
    ).toThrow(/greater than zero/i);
  });

  it('rejects amount above Binance free', () => {
    expect(() =>
      resolveTreasuryBinanceBrlWithdrawAmount({
        requestedAmountBrl: '100',
        binanceBrlFree: '50',
      }),
    ).toThrow(/exceeds Binance BRL free/i);
  });
});

describe('projectBinanceBrlWithdrawBalances', () => {
  it('subtracts the 3.50 fee from the amount credited to CorpX', () => {
    expect(
      projectBinanceBrlWithdrawBalances({
        amountBrl: '100',
        binanceBrlFree: '180.00000000',
        corpxAvailable: '20.00',
      }),
    ).toEqual({
      withdrawFeeBrl: '3.5',
      amountNetBrl: '96.5',
      binanceBrlAfter: '80',
      corpxBrlAfter: '116.5',
    });
  });

  it('allows Binance to go to zero and keeps CorpX unavailable', () => {
    expect(
      projectBinanceBrlWithdrawBalances({
        amountBrl: '10',
        binanceBrlFree: '10',
        corpxAvailable: 'unavailable',
      }),
    ).toEqual({
      withdrawFeeBrl: '3.5',
      amountNetBrl: '6.5',
      binanceBrlAfter: '0',
      corpxBrlAfter: 'unavailable',
    });
  });

  it('rejects amount that does not cover the fee', () => {
    expect(() =>
      projectBinanceBrlWithdrawBalances({
        amountBrl: '3.5',
        binanceBrlFree: '80',
        corpxAvailable: '10',
      }),
    ).toThrow(/greater than the Binance BRL withdraw fee/i);
  });
});

describe('projectCorpxBrlToBinanceBalances', () => {
  it('moves the amount from CorpX to Binance', () => {
    expect(
      projectCorpxBrlToBinanceBalances({
        amountBrl: '40',
        corpxAvailable: '100.00',
        binanceBrlFree: '12.00000000',
      }),
    ).toEqual({
      corpxBrlAfter: '60',
      binanceBrlAfter: '52',
    });
  });

  it('allows CorpX to go to zero and keeps Binance unavailable', () => {
    expect(
      projectCorpxBrlToBinanceBalances({
        amountBrl: '25',
        corpxAvailable: '25',
        binanceBrlFree: 'unavailable',
      }),
    ).toEqual({
      corpxBrlAfter: '0',
      binanceBrlAfter: 'unavailable',
    });
  });
});
