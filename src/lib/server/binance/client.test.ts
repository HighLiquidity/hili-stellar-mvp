import { describe, expect, it } from 'vitest';

import {
  buildSignedBinancePayload,
  parseBinanceErrorPayload,
  serializeBinanceParams,
} from './client';

describe('serializeBinanceParams', () => {
  it('serializes supported values and omits nullish params', () => {
    const params = serializeBinanceParams({
      symbol: 'BTCUSDT',
      limit: 10,
      recvWindow: null,
      test: undefined,
      isIsolated: false,
    });

    expect(params.toString()).toBe('symbol=BTCUSDT&limit=10&isIsolated=false');
  });
});

describe('buildSignedBinancePayload', () => {
  it('builds the exact payload string sent to Binance', () => {
    const params = new URLSearchParams({
      symbol: 'BTCUSDT',
      timestamp: '1',
    });

    expect(buildSignedBinancePayload(params, 'test-secret')).toBe(
      'symbol=BTCUSDT&timestamp=1&signature=21c24303cc1bb37447f65bb987cffdcc24c07d31ced1d8567ec9d6cc9a74aab3',
    );
  });

  it('drops any pre-existing signature before resigning', () => {
    const params = new URLSearchParams({
      symbol: 'BTCUSDT',
      timestamp: '1',
      signature: 'old-signature',
    });

    expect(buildSignedBinancePayload(params, 'test-secret')).toBe(
      'symbol=BTCUSDT&timestamp=1&signature=21c24303cc1bb37447f65bb987cffdcc24c07d31ced1d8567ec9d6cc9a74aab3',
    );
  });
});

describe('parseBinanceErrorPayload', () => {
  it('parses standard Binance JSON error bodies', () => {
    expect(parseBinanceErrorPayload('{"code":-1121,"msg":"Invalid symbol."}')).toEqual({
      code: -1121,
      message: 'Invalid symbol.',
      details: { code: -1121, msg: 'Invalid symbol.' },
    });
  });

  it('falls back to raw text for non-JSON errors', () => {
    expect(parseBinanceErrorPayload('upstream gateway error')).toEqual({
      code: null,
      message: 'upstream gateway error',
      details: 'upstream gateway error',
    });
  });

  it('returns a stable message for empty error bodies', () => {
    expect(parseBinanceErrorPayload('')).toEqual({
      code: null,
      message: 'Binance request failed with an empty error body',
      details: null,
    });
  });
});
