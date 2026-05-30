import { describe, expect, it } from 'vitest';

import {
  calculateNetUsdcDeliveredToClient,
  DEFAULT_ONRAMP_USDC_DELIVERY_FEE_USDC,
} from './usdc-delivery-fee';

describe('onramp USDC delivery fee', () => {
  it('defaults to 1 USDC', () => {
    expect(DEFAULT_ONRAMP_USDC_DELIVERY_FEE_USDC).toBe('1');
  });

  it('calculates net client delivery from gross quoted amount', () => {
    expect(calculateNetUsdcDeliveredToClient('5', '1')).toBe('4');
    expect(calculateNetUsdcDeliveredToClient('18.2268185', '1')).toBe('17.2268185');
  });

  it('rejects gross amounts that do not cover the fee', () => {
    expect(() => calculateNetUsdcDeliveredToClient('1', '1')).toThrowError(/greater than the USDC delivery fee/);
  });
});
