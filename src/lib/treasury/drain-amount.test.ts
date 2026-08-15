import { describe, expect, it } from 'vitest';

import {
  formatRampUsdcAmount,
  projectTreasuryUsdcDrainBalances,
  resolveTreasuryUsdcDrainAmount,
} from './drain-amount';

describe('resolveTreasuryUsdcDrainAmount', () => {
  it('uses full distributor balance when amount is omitted', () => {
    expect(
      resolveTreasuryUsdcDrainAmount({
        distributorUsdc: '25.5',
      }),
    ).toBe('25.5');
  });

  it('accepts an explicit amount within distributor balance', () => {
    expect(
      resolveTreasuryUsdcDrainAmount({
        requestedAmount: '10',
        distributorUsdc: '25.5',
      }),
    ).toBe('10');
  });

  it('rejects amount above distributor balance', () => {
    expect(() =>
      resolveTreasuryUsdcDrainAmount({
        requestedAmount: '30',
        distributorUsdc: '25.5',
      }),
    ).toThrow(/exceeds distributor USDC balance/i);
  });

  it('rejects amount below minimum deposit', () => {
    expect(() =>
      resolveTreasuryUsdcDrainAmount({
        requestedAmount: '0.5',
        distributorUsdc: '25.5',
      }),
    ).toThrow(/at least/i);
  });
});

describe('formatRampUsdcAmount', () => {
  it('keeps a trailing .0 for whole amounts (Ramp ingress)', () => {
    expect(formatRampUsdcAmount('10')).toBe('10.0');
  });

  it('preserves fractional USDC up to 7 decimals', () => {
    expect(formatRampUsdcAmount('10.25')).toBe('10.25');
  });
});

describe('projectTreasuryUsdcDrainBalances', () => {
  it('debits distributor and credits Binance', () => {
    expect(
      projectTreasuryUsdcDrainBalances({
        amount: '10',
        distributorUsdc: '40',
        binanceUsdcFree: '5',
      }),
    ).toEqual({
      distributorAfter: '30',
      binanceAfter: '15',
    });
  });

  it('marks Binance after as unavailable when free balance is unknown', () => {
    expect(
      projectTreasuryUsdcDrainBalances({
        amount: '10',
        distributorUsdc: '40',
        binanceUsdcFree: 'unavailable',
      }).binanceAfter,
    ).toBe('unavailable');
  });
});
