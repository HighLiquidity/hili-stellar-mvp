import { describe, expect, it } from 'vitest';

import { isDepositAboveMax, parseMaxDepositBrl } from './deposit-limits';

describe('deposit-limits', () => {
  it('parses max deposit with comma or dot', () => {
    expect(parseMaxDepositBrl('1000.00')).toBe(1000);
    expect(parseMaxDepositBrl('99,90')).toBe(99.9);
  });

  it('returns null for invalid max deposit', () => {
    expect(parseMaxDepositBrl('abc')).toBeNull();
    expect(parseMaxDepositBrl('')).toBeNull();
  });

  it('flags amounts strictly above max', () => {
    expect(isDepositAboveMax(1000.01, 1000)).toBe(true);
    expect(isDepositAboveMax(1000, 1000)).toBe(false);
    expect(isDepositAboveMax(999.99, 1000)).toBe(false);
  });
});
