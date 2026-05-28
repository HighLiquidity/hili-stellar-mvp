import { describe, expect, it } from 'vitest';

import { OfframpValidationError } from './errors';
import {
  applyOfframpQuoteSpread,
  calculateQuotedBrlAmount,
  normalizeOfframpAmountUsdc,
  normalizeOfframpPayoutPixKey,
} from './quote';

describe('offramp quote helpers', () => {
  it('normalizes USDC amounts', () => {
    expect(normalizeOfframpAmountUsdc('100')).toBe('100.00');
    expect(normalizeOfframpAmountUsdc('100,5')).toBe('100.50');
    expect(normalizeOfframpAmountUsdc('0.1234567')).toBe('0.1234567');
  });

  it('rejects invalid USDC amounts', () => {
    expect(() => normalizeOfframpAmountUsdc('0')).toThrowError(OfframpValidationError);
    expect(() => normalizeOfframpAmountUsdc('1.12345678')).toThrowError(OfframpValidationError);
  });

  it('requires payout pix key', () => {
    expect(normalizeOfframpPayoutPixKey('user@example.com')).toBe('user@example.com');
    expect(() => normalizeOfframpPayoutPixKey('   ')).toThrowError(OfframpValidationError);
  });

  it('applies spread bps below the market rate for sells', () => {
    expect(applyOfframpQuoteSpread('5.4321', 100)).toBe('5.377779');
    expect(applyOfframpQuoteSpread('5.4321', 0)).toBe('5.4321');
  });

  it('calculates quoted BRL from USDC using decimal-safe rounding', () => {
    expect(calculateQuotedBrlAmount('20.00', '5.00')).toBe('100.00');
    expect(calculateQuotedBrlAmount('18.2268185', '5.486421')).toBe('100.00');
  });
});
