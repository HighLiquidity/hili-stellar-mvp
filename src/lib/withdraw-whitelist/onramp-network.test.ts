import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getOnrampWithdrawNetwork,
  normalizeWithdrawWhitelistAddress,
  shouldOfferWithdrawWhitelistMemo,
  WithdrawWhitelistAddressError,
} from './onramp-network';

const VALID_G = `G${'A'.repeat(55)}`;
const VALID_C = `C${'A'.repeat(55)}`;

describe('withdraw whitelist on-ramp network helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('normalizes valid Stellar G/C addresses to uppercase', () => {
    expect(normalizeWithdrawWhitelistAddress(`  ${VALID_G.toLowerCase()}  `)).toBe(VALID_G);
    expect(normalizeWithdrawWhitelistAddress(`  ${VALID_C.toLowerCase()}  `)).toBe(VALID_C);
  });

  it('rejects non-Stellar addresses', () => {
    expect(() => normalizeWithdrawWhitelistAddress('wallet-123')).toThrowError(
      WithdrawWhitelistAddressError,
    );
  });

  it('hides memo for Soroban C destinations', () => {
    expect(shouldOfferWithdrawWhitelistMemo(VALID_G)).toBe(true);
    expect(shouldOfferWithdrawWhitelistMemo(VALID_C)).toBe(false);
    expect(shouldOfferWithdrawWhitelistMemo('')).toBe(true);
  });

  it('defaults on-ramp network to STELLAR_TESTNET', () => {
    expect(getOnrampWithdrawNetwork()).toBe('STELLAR_TESTNET');
  });

  it('reads STELLAR_PUBLIC from ONRAMP_WITHDRAW_NETWORK', () => {
    vi.stubEnv('ONRAMP_WITHDRAW_NETWORK', 'STELLAR_PUBLIC');
    expect(getOnrampWithdrawNetwork()).toBe('STELLAR_PUBLIC');
  });

  it('trims and uppercases ONRAMP_WITHDRAW_NETWORK', () => {
    vi.stubEnv('ONRAMP_WITHDRAW_NETWORK', '  stellar_public  ');
    expect(getOnrampWithdrawNetwork()).toBe('STELLAR_PUBLIC');
  });
});
