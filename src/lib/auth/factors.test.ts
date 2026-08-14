import { describe, expect, it } from 'vitest';

import { collectMfaFactors, hasVerifiedTotpFactor, unverifiedTotpFactors, verifiedTotpFactors } from './factors';

describe('collectMfaFactors', () => {
  it('reads admin { factors } and client { totp, all } shapes', () => {
    expect(collectMfaFactors({ factors: [{ id: 'a', factor_type: 'totp', status: 'verified' }] })).toHaveLength(1);
    expect(
      collectMfaFactors({
        totp: [{ id: 't', factor_type: 'totp', status: 'verified' }],
        phone: [],
      }),
    ).toHaveLength(1);
    expect(collectMfaFactors({ all: [{ id: 'x', factor_type: 'totp', status: 'unverified' }] })).toHaveLength(1);
  });
});

describe('verifiedTotpFactors', () => {
  it('keeps only verified totp factors with an id', () => {
    const data = {
      factors: [
        { id: 'ok', factor_type: 'totp', status: 'verified' },
        { id: 'pending', factor_type: 'totp', status: 'unverified' },
        { id: 'phone', factor_type: 'phone', status: 'verified' },
        { factor_type: 'totp', status: 'verified' },
      ],
    };

    expect(verifiedTotpFactors(data).map((factor) => factor.id)).toEqual(['ok']);
    expect(hasVerifiedTotpFactor(data)).toBe(true);
    expect(unverifiedTotpFactors(data).map((factor) => factor.id)).toEqual(['pending']);
    expect(hasVerifiedTotpFactor({ factors: [] })).toBe(false);
  });
});
