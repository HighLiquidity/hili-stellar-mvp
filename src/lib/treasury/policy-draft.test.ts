import { describe, expect, it } from 'vitest';

import {
  createDefaultTreasuryPolicyDraft,
  effectiveHigh,
  effectiveLow,
  parsePolicyNumber,
} from './policy-draft';

describe('parsePolicyNumber', () => {
  it('accepts comma decimals', () => {
    expect(parsePolicyNumber('1.5')).toBe(1.5);
    expect(parsePolicyNumber('1,5')).toBe(1.5);
  });

  it('returns 0 for empty or invalid', () => {
    expect(parsePolicyNumber('')).toBe(0);
    expect(parsePolicyNumber('abc')).toBe(0);
  });
});

describe('effectiveLow', () => {
  it('uses the percent floor when it is higher than the absolute min', () => {
    expect(effectiveLow('500', '5000', '20')).toBe(1000);
  });

  it('uses the absolute min when the percent floor is lower', () => {
    expect(effectiveLow('500', '5000', '5')).toBe(500);
  });
});

describe('effectiveHigh', () => {
  it('uses the percent cap when it is lower than the absolute max', () => {
    expect(effectiveHigh('15000', '5000', '180')).toBe(9000);
  });

  it('uses the absolute max when the percent cap is higher', () => {
    expect(effectiveHigh('8000', '5000', '180')).toBe(8000);
  });

  it('falls back to the percent cap when max abs is empty', () => {
    expect(effectiveHigh('', '40', '200')).toBe(80);
  });
});

describe('createDefaultTreasuryPolicyDraft', () => {
  it('starts with auto off, shadow on, and BRL rail off', () => {
    const draft = createDefaultTreasuryPolicyDraft();
    expect(draft.autoEnabled).toBe(false);
    expect(draft.shadowMode).toBe(true);
    expect(draft.rails.brl.autoEnabled).toBe(false);
    expect(draft.usdcRefillMode).toBe('batch');
  });

  it('returns a fresh object each call', () => {
    const a = createDefaultTreasuryPolicyDraft();
    const b = createDefaultTreasuryPolicyDraft();
    a.autoEnabled = true;
    expect(b.autoEnabled).toBe(false);
  });
});
