import { describe, expect, it } from 'vitest';

import {
  BinanceError,
  BinanceRequestError,
  BINANCE_IP_RESTRICTION_CODE,
  isBinanceIpRestrictionError,
} from './errors';

describe('isBinanceIpRestrictionError', () => {
  it('matches numeric and string -2015 on BinanceRequestError', () => {
    expect(
      isBinanceIpRestrictionError(
        new BinanceRequestError(401, -2015, 'Invalid API-key, IP, or permissions for action.'),
      ),
    ).toBe(true);
    expect(
      isBinanceIpRestrictionError(
        new BinanceRequestError(401, '-2015', 'Invalid API-key, IP, or permissions for action.'),
      ),
    ).toBe(true);
    expect(BINANCE_IP_RESTRICTION_CODE).toBe(-2015);
  });

  it('rejects other request failures, timeouts, and generic errors', () => {
    expect(
      isBinanceIpRestrictionError(new BinanceRequestError(400, -2010, 'Account has insufficient balance')),
    ).toBe(false);
    expect(
      isBinanceIpRestrictionError(new BinanceRequestError(400, -1022, 'Signature for this request is not valid.')),
    ).toBe(false);
    expect(
      isBinanceIpRestrictionError(
        new BinanceRequestError(0, null, 'Binance request timed out after 5000ms'),
      ),
    ).toBe(false);
    expect(isBinanceIpRestrictionError(new BinanceError('nope'))).toBe(false);
    expect(isBinanceIpRestrictionError(new Error('Invalid API-key, IP, or permissions for action.'))).toBe(
      false,
    );
    expect(isBinanceIpRestrictionError({ code: -2015 })).toBe(false);
  });
});
