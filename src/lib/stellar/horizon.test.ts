import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  mapHorizonBalances,
  pickNativeBalance,
  pickUsdcBalance,
  resolveHorizonUrl,
  resolveUsdcIssuer,
  STELLAR_PUBLIC_USDC_ISSUER,
  STELLAR_TESTNET_USDC_ISSUER,
} from './horizon';

describe('stellar/horizon helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves horizon URL from env override', () => {
    vi.stubEnv('STELLAR_HORIZON_URL', 'https://horizon.example/');
    expect(resolveHorizonUrl()).toBe('https://horizon.example');
  });

  it('defaults horizon URL from on-ramp network', () => {
    vi.stubEnv('ONRAMP_WITHDRAW_NETWORK', 'STELLAR_PUBLIC');
    expect(resolveHorizonUrl()).toBe('https://horizon.stellar.org');

    vi.stubEnv('ONRAMP_WITHDRAW_NETWORK', 'STELLAR_TESTNET');
    expect(resolveHorizonUrl()).toBe('https://horizon-testnet.stellar.org');
  });

  it('resolves USDC issuer defaults per network', () => {
    vi.stubEnv('ONRAMP_WITHDRAW_NETWORK', 'STELLAR_PUBLIC');
    expect(resolveUsdcIssuer()).toBe(STELLAR_PUBLIC_USDC_ISSUER);

    vi.stubEnv('ONRAMP_WITHDRAW_NETWORK', 'STELLAR_TESTNET');
    expect(resolveUsdcIssuer()).toBe(STELLAR_TESTNET_USDC_ISSUER);

    vi.stubEnv('STELLAR_USDC_ISSUER', 'GCUSTOMISSUER');
    expect(resolveUsdcIssuer()).toBe('GCUSTOMISSUER');
  });

  it('picks native and USDC balances', () => {
    const balances = mapHorizonBalances([
      { asset_type: 'native', balance: '12.5' },
      {
        asset_type: 'credit_alphanum4',
        asset_code: 'USDC',
        asset_issuer: STELLAR_PUBLIC_USDC_ISSUER,
        balance: '100.25',
      },
      {
        asset_type: 'credit_alphanum4',
        asset_code: 'USDC',
        asset_issuer: 'GOTHER',
        balance: '1',
      },
    ]);

    expect(pickNativeBalance(balances)).toBe('12.5');
    expect(pickUsdcBalance(balances, STELLAR_PUBLIC_USDC_ISSUER)).toEqual({
      balance: '100.25',
      issuer: STELLAR_PUBLIC_USDC_ISSUER,
    });
    expect(pickUsdcBalance(balances, null).balance).toBe('101.25');
  });
});
