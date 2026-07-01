import { describe, expect, it } from 'vitest';

import {
  assertOperatorMaxWithinClientCeiling,
  tightenMaxAmountBrl,
} from './operator-limits';

describe('tightenMaxAmountBrl', () => {
  it('returns the lower of client and operator limits', () => {
    expect(tightenMaxAmountBrl('2000.00', '1000.00')).toBe('1000.00');
    expect(tightenMaxAmountBrl('1000.00', '2000.00')).toBe('1000.00');
  });

  it('falls back when one side is unset', () => {
    expect(tightenMaxAmountBrl('2000.00', null)).toBe('2000.00');
    expect(tightenMaxAmountBrl(null, '1000.00')).toBe('1000.00');
  });
});

describe('assertOperatorMaxWithinClientCeiling', () => {
  it('allows operator limit within client ceiling', () => {
    expect(() => assertOperatorMaxWithinClientCeiling('1000.00', '2000.00')).not.toThrow();
  });

  it('rejects operator limit above client ceiling', () => {
    expect(() => assertOperatorMaxWithinClientCeiling('3000.00', '2000.00')).toThrow(
      /cannot exceed the client limit/i,
    );
  });

  it('allows empty operator limit', () => {
    expect(() => assertOperatorMaxWithinClientCeiling(null, '2000.00')).not.toThrow();
  });
});
