import { describe, expect, it } from 'vitest';

import { buildOfframpExternalId, buildOnrampExternalId, formatRampAmountFromBrl } from './amount';

describe('formatRampAmountFromBrl', () => {
  it('formats with up to 7 fractional digits', () => {
    expect(formatRampAmountFromBrl('150')).toBe('150.0');
    expect(formatRampAmountFromBrl('150.50')).toBe('150.5');
    expect(formatRampAmountFromBrl('0.0000001')).toBe('0.0000001');
  });

  it('rejects invalid amounts', () => {
    expect(() => formatRampAmountFromBrl('0')).toThrow();
    expect(() => formatRampAmountFromBrl('-1')).toThrow();
  });
});

describe('buildOnrampExternalId', () => {
  it('prefers provider tx id', () => {
    expect(buildOnrampExternalId('tx-99', 'dedupe-abc')).toBe('corpx-onramp:tx-99');
  });
});

describe('buildOfframpExternalId', () => {
  it('uses withdraw idempotency key', () => {
    expect(buildOfframpExternalId('abc123')).toBe('corpx-offramp:abc123');
  });

  it('rejects empty key', () => {
    expect(() => buildOfframpExternalId('  ')).toThrow();
  });
});
