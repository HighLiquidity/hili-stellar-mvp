import { describe, expect, it } from 'vitest';

import { signBinanceMessage, signBinanceQuery } from './signer';

describe('signBinanceMessage', () => {
  it('returns the expected HMAC SHA256 hex digest', () => {
    expect(signBinanceMessage('symbol=BTCUSDT&timestamp=1', 'test-secret')).toBe(
      '21c24303cc1bb37447f65bb987cffdcc24c07d31ced1d8567ec9d6cc9a74aab3',
    );
  });
});

describe('signBinanceQuery', () => {
  it('signs URLSearchParams using the same canonical query string', () => {
    const params = new URLSearchParams({
      symbol: 'BTCUSDT',
      timestamp: '1',
    });

    expect(signBinanceQuery(params, 'test-secret')).toBe(
      '21c24303cc1bb37447f65bb987cffdcc24c07d31ced1d8567ec9d6cc9a74aab3',
    );
  });
});
