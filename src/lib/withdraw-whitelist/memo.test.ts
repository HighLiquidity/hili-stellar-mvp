import { describe, expect, it } from 'vitest';

import { normalizeWithdrawWhitelistMemo } from './memo';

describe('withdraw whitelist memo', () => {
  it('returns null for empty values', () => {
    expect(normalizeWithdrawWhitelistMemo(null)).toBeNull();
    expect(normalizeWithdrawWhitelistMemo('')).toBeNull();
    expect(normalizeWithdrawWhitelistMemo('   ')).toBeNull();
  });

  it('normalizes and truncates to 28 UTF-8 bytes', () => {
    expect(normalizeWithdrawWhitelistMemo('client-42')).toBe('client-42');
    expect(normalizeWithdrawWhitelistMemo('  pooled-memo  ')).toBe('pooled-memo');
    expect(normalizeWithdrawWhitelistMemo('a'.repeat(40))?.length).toBeLessThanOrEqual(28);
  });
});
