import { describe, expect, it } from 'vitest';

import { normalizeIntegratorExternalId, readOptionalIntegratorExternalId } from './external-id';

describe('integrator external id', () => {
  it('normalizes valid ids', () => {
    expect(normalizeIntegratorExternalId(' erp-order-1 ')).toBe('erp-order-1');
    expect(readOptionalIntegratorExternalId('partner:42')).toBe('partner:42');
  });

  it('rejects invalid ids', () => {
    expect(() => normalizeIntegratorExternalId('')).toThrowError(/non-empty/i);
    expect(() => normalizeIntegratorExternalId('has space')).toThrowError(/1–128 characters/i);
    expect(() => readOptionalIntegratorExternalId(42)).toThrowError(/string/i);
  });
});
