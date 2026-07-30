import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BinanceClient,
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

describe('BinanceClient.signedPostJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('signs query params only and sends JSON body without mixing HMAC fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: '000000', message: 'success', data: { orderId: 'ord-1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new BinanceClient({
      baseUrl: 'https://api.binance.com',
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      timeoutMs: 5000,
    });

    const result = await client.signedPostJson<{
      code: string;
      data: { orderId: string };
    }>(
      '/sapi/v1/fiat/deposit',
      { currency: 'BRL', apiPaymentMethod: 'Pix', amount: 30 },
      { timestamp: 1, recvWindow: 5000 },
    );

    expect(result.data.orderId).toBe('ord-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsedUrl = new URL(url);
    expect(parsedUrl.pathname).toBe('/sapi/v1/fiat/deposit');
    expect(parsedUrl.searchParams.get('timestamp')).toBe('1');
    expect(parsedUrl.searchParams.get('recvWindow')).toBe('5000');
    expect(parsedUrl.searchParams.get('signature')).toBe(
      buildSignedBinancePayload(
        new URLSearchParams({ timestamp: '1', recvWindow: '5000' }),
        'test-secret',
      ).split('signature=')[1],
    );
    expect(parsedUrl.searchParams.has('currency')).toBe(false);
    expect(parsedUrl.searchParams.has('amount')).toBe(false);

    expect(init.method).toBe('POST');
    expect(init.headers).toBeInstanceOf(Headers);
    const headers = init.headers as Headers;
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-MBX-APIKEY')).toBe('test-key');
    expect(JSON.parse(String(init.body))).toEqual({
      currency: 'BRL',
      apiPaymentMethod: 'Pix',
      amount: 30,
    });
  });
});
