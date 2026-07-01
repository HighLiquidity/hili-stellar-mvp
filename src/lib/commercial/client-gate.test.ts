import { afterEach, describe, expect, it, vi } from 'vitest';

import { assertClientEligibleForQuotes } from './client-gate';

describe('assertClientEligibleForQuotes', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows active client when KYB gate is off', () => {
    vi.stubEnv('CLIENT_KYB_REQUIRED', 'false');
    expect(() =>
      assertClientEligibleForQuotes({ status: 'active', kybStatus: 'not_started' }, 'onramp'),
    ).not.toThrow();
  });

  it('blocks non-active client status', () => {
    expect(() => assertClientEligibleForQuotes({ status: 'draft', kybStatus: 'approved' }, 'onramp')).toThrow(
      /does not allow quoting/i,
    );
  });

  it('blocks quote when KYB is required and not approved', () => {
    vi.stubEnv('CLIENT_KYB_REQUIRED', 'true');
    expect(() =>
      assertClientEligibleForQuotes({ status: 'active', kybStatus: 'pending' }, 'offramp'),
    ).toThrow(/KYB status/i);
  });

  it('allows quote when KYB is required and approved', () => {
    vi.stubEnv('CLIENT_KYB_REQUIRED', 'true');
    expect(() =>
      assertClientEligibleForQuotes({ status: 'active', kybStatus: 'approved' }, 'onramp'),
    ).not.toThrow();
  });
});
