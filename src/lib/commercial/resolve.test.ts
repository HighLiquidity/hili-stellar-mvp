import { describe, expect, it } from 'vitest';

import { resolveCommercialTerms } from './resolve';

describe('resolveCommercialTerms', () => {
  it('prefers operator profile over env and legacy api key', () => {
    const terms = resolveCommercialTerms({
      envSpreadBps: 10,
      operatorProfile: { spreadBpsOverride: 25, maxAmountBrl: '1000.00' },
      legacyApiKeySpreadBpsOverride: 50,
      legacyApiKeyMaxAmountBrl: '500.00',
    });

    expect(terms).toEqual({ spreadBps: 25, maxAmountBrl: '1000.00' });
  });

  it('falls back to legacy api key then env spread', () => {
    expect(
      resolveCommercialTerms({
        envSpreadBps: 10,
        legacyApiKeySpreadBpsOverride: 30,
      }).spreadBps,
    ).toBe(30);

    expect(
      resolveCommercialTerms({
        envSpreadBps: 10,
      }).spreadBps,
    ).toBe(10);
  });
});
