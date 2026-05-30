import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getOnrampWithdrawNetwork,
  normalizeWithdrawWhitelistAddress,
} from './onramp-network';

describe('withdraw whitelist on-ramp network helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('normalizes Stellar addresses to uppercase', () => {
    expect(normalizeWithdrawWhitelistAddress('  gabc123  ')).toBe('GABC123');
  });

  it('defaults on-ramp network to STELLAR_TESTNET', () => {
    expect(getOnrampWithdrawNetwork()).toBe('STELLAR_TESTNET');
  });

  it('reads STELLAR_PUBLIC from ONRAMP_WITHDRAW_NETWORK', () => {
    vi.stubEnv('ONRAMP_WITHDRAW_NETWORK', 'STELLAR_PUBLIC');
    expect(getOnrampWithdrawNetwork()).toBe('STELLAR_PUBLIC');
  });
});
