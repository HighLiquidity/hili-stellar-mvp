import { describe, expect, it } from 'vitest';

import {
  isSorobanDestinationAddress,
  resolveOnrampPayoutMethod,
  STELLAR_DESTINATION_PATTERN,
} from './destination';

const VALID_G = `G${'A'.repeat(55)}`;
const VALID_C = `C${'A'.repeat(55)}`;

describe('onramp destination helpers', () => {
  it('matches classic G and contract C addresses', () => {
    expect(STELLAR_DESTINATION_PATTERN.test(VALID_G)).toBe(true);
    expect(STELLAR_DESTINATION_PATTERN.test(VALID_C)).toBe(true);
    expect(STELLAR_DESTINATION_PATTERN.test('wallet-123')).toBe(false);
    expect(STELLAR_DESTINATION_PATTERN.test(`X${'A'.repeat(55)}`)).toBe(false);
  });

  it('detects Soroban destinations', () => {
    expect(isSorobanDestinationAddress(VALID_C)).toBe(true);
    expect(isSorobanDestinationAddress(VALID_C.toLowerCase())).toBe(true);
    expect(isSorobanDestinationAddress(VALID_G)).toBe(false);
  });

  it('resolves payout method from destination prefix', () => {
    expect(resolveOnrampPayoutMethod(VALID_G)).toBe('classic');
    expect(resolveOnrampPayoutMethod(VALID_C)).toBe('soroban');
  });
});
