import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveTreasuryDepositAddress, resolveTreasuryDepositMemo } from './treasury-deposit';

describe('resolveTreasuryDepositMemo', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null when tag is unset', () => {
    vi.stubEnv('ONRAMP_USDC_DISTRIBUTOR_ADDRESS_TAG', '');
    expect(resolveTreasuryDepositMemo()).toBeNull();
  });

  it('returns trimmed tag within Stellar memo limit', () => {
    vi.stubEnv('ONRAMP_USDC_DISTRIBUTOR_ADDRESS_TAG', '  TREASURY  ');
    expect(resolveTreasuryDepositMemo()).toBe('TREASURY');
  });
});

describe('resolveTreasuryDepositAddress', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns configured distributor address', () => {
    vi.stubEnv('ONRAMP_USDC_DISTRIBUTOR_ADDRESS', ' GABC123 ');
    expect(resolveTreasuryDepositAddress()).toBe('GABC123');
  });
});
