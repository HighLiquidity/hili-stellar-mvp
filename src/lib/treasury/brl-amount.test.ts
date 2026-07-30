import { describe, expect, it } from 'vitest';

import { normalizeBrlAmount, resolveTreasuryBrlAmount } from './brl-amount';

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
