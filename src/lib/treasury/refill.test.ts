import { describe, expect, it } from 'vitest';

import {
  projectTreasuryRefillBalances,
  resolveTreasuryRefillAmount,
  resolveTreasuryRefillAmountUsdc,
} from './refill-amount';

describe('resolveTreasuryRefillAmount', () => {
  it('uses full free balance when amount is omitted (USDC)', () => {
    expect(
      resolveTreasuryRefillAmount({
        asset: 'USDC',
        binanceFree: '25.5',
      }),
    ).toBe('25.5');
  });

  it('accepts an explicit amount within free balance (USDC)', () => {
    expect(
      resolveTreasuryRefillAmount({
        asset: 'USDC',
        requestedAmount: '10',
        binanceFree: '25.5',
      }),
    ).toBe('10');
  });

  it('rejects amount above free balance (USDC)', () => {
    expect(() =>
      resolveTreasuryRefillAmount({
        asset: 'USDC',
        requestedAmount: '30',
        binanceFree: '25.5',
      }),
    ).toThrow(/exceeds Binance USDC free balance/i);
  });

  it('rejects amount below Binance minimum withdraw (USDC)', () => {
    expect(() =>
      resolveTreasuryRefillAmount({
        asset: 'USDC',
        requestedAmount: '1',
        binanceFree: '25.5',
      }),
    ).toThrow(/at least/i);
  });

  it('uses full free balance when amount is omitted (XLM)', () => {
    expect(
      resolveTreasuryRefillAmount({
        asset: 'XLM',
        binanceFree: '40',
      }),
    ).toBe('40');
  });

  it('rejects amount below Binance minimum withdraw (XLM)', () => {
    expect(() =>
      resolveTreasuryRefillAmount({
        asset: 'XLM',
        requestedAmount: '0.1',
        binanceFree: '40',
      }),
    ).toThrow(/at least/i);
  });
});

describe('resolveTreasuryRefillAmountUsdc (compat)', () => {
  it('delegates to resolveTreasuryRefillAmount', () => {
    expect(
      resolveTreasuryRefillAmountUsdc({
        requestedAmountUsdc: '10',
        binanceUsdcFree: '25.5',
      }),
    ).toBe('10');
  });
});

describe('projectTreasuryRefillBalances', () => {
  it('moves USDC from Binance to the distributor', () => {
    expect(
      projectTreasuryRefillBalances({
        asset: 'USDC',
        amount: '10',
        binanceFree: '25.50000000',
        distributorBalance: '3.25',
      }),
    ).toEqual({
      binanceAfter: '15.5',
      distributorAfter: '13.25',
    });
  });

  it('allows Binance to go to zero and keeps distributor unavailable', () => {
    expect(
      projectTreasuryRefillBalances({
        asset: 'XLM',
        amount: '12',
        binanceFree: '12',
        distributorBalance: 'unavailable',
      }),
    ).toEqual({
      binanceAfter: '0',
      distributorAfter: 'unavailable',
    });
  });
});
