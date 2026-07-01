import { afterEach, describe, expect, it, vi } from 'vitest';

import { isClientKybRequired } from './compliance-config';

describe('isClientKybRequired', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns false when unset', () => {
    vi.stubEnv('CLIENT_KYB_REQUIRED', '');
    expect(isClientKybRequired()).toBe(false);
  });

  it('returns false for explicit false', () => {
    vi.stubEnv('CLIENT_KYB_REQUIRED', 'false');
    expect(isClientKybRequired()).toBe(false);
  });

  it('returns true for true, 1, and yes (case-insensitive)', () => {
    vi.stubEnv('CLIENT_KYB_REQUIRED', 'true');
    expect(isClientKybRequired()).toBe(true);

    vi.stubEnv('CLIENT_KYB_REQUIRED', '1');
    expect(isClientKybRequired()).toBe(true);

    vi.stubEnv('CLIENT_KYB_REQUIRED', 'YES');
    expect(isClientKybRequired()).toBe(true);
  });
});
