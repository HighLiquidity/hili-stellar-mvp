import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BinanceClient,
  buildSignedBinancePayload,
  parseBinanceErrorPayload,
  resetBinanceEgressState,
  serializeBinanceParams,
} from './client';
import type { BinanceConfig } from './config';

vi.mock('undici', () => {
  class Agent {
    readonly options: { connect?: { localAddress?: string } } | undefined;

    constructor(options?: { connect?: { localAddress?: string } }) {
      this.options = options;
    }
  }

  return {
    Agent,
    fetch: (input: string, init?: RequestInit) => globalThis.fetch(input, init),
  };
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function dualConfig(overrides: Partial<BinanceConfig> = {}): BinanceConfig {
  return {
    baseUrl: 'https://api.binance.com',
    apiKey: 'primary-key',
    apiSecret: 'primary-secret',
    timeoutMs: 5000,
    localAddress: '203.0.113.10',
    secondary: {
      apiKey: 'secondary-key',
      apiSecret: 'secondary-secret',
      localAddress: '203.0.113.11',
    },
    ...overrides,
  };
}

function readCall(fetchMock: ReturnType<typeof vi.fn>, index: number): {
  url: URL;
  headers: Headers;
  init: RequestInit & { dispatcher?: { options?: { connect?: { localAddress?: string } } } };
} {
  const [url, init] = fetchMock.mock.calls[index] as [
    string,
    RequestInit & { dispatcher?: { options?: { connect?: { localAddress?: string } } } },
  ];
  return {
    url: new URL(url),
    headers: init.headers as Headers,
    init,
  };
}

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
    resetBinanceEgressState();
  });

  it('signs query params only and sends JSON body without mixing HMAC fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { code: '000000', message: 'success', data: { orderId: 'ord-1' } }),
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

describe('BinanceClient egress failover', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetBinanceEgressState();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetBinanceEgressState();
  });

  it('retries signed GET once on -2015 with the other profile and the same business params', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(401, { code: -2015, msg: 'Invalid API-key, IP, or permissions for action.' }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { accountType: 'SPOT' }));

    const client = new BinanceClient(dualConfig());
    const result = await client.signedGet<{ accountType: string }>('/api/v3/account', {
      timestamp: 1,
      recvWindow: 5000,
    });

    expect(result.accountType).toBe('SPOT');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const first = readCall(fetchMock, 0);
    const second = readCall(fetchMock, 1);

    expect(first.headers.get('X-MBX-APIKEY')).toBe('primary-key');
    expect(second.headers.get('X-MBX-APIKEY')).toBe('secondary-key');
    expect(first.url.searchParams.get('timestamp')).toBe('1');
    expect(second.url.searchParams.get('timestamp')).toBe('1');
    expect(first.url.searchParams.get('recvWindow')).toBe('5000');
    expect(second.url.searchParams.get('recvWindow')).toBe('5000');
    expect(first.url.searchParams.get('signature')).toBe(
      buildSignedBinancePayload(
        new URLSearchParams({ timestamp: '1', recvWindow: '5000' }),
        'primary-secret',
      ).split('signature=')[1],
    );
    expect(second.url.searchParams.get('signature')).toBe(
      buildSignedBinancePayload(
        new URLSearchParams({ timestamp: '1', recvWindow: '5000' }),
        'secondary-secret',
      ).split('signature=')[1],
    );
    expect(first.init.dispatcher?.options?.connect?.localAddress).toBe('203.0.113.10');
    expect(second.init.dispatcher?.options?.connect?.localAddress).toBe('203.0.113.11');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('retries signed POST with a new signature but identical business fields', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(401, { code: '-2015', msg: 'Invalid API-key, IP, or permissions for action.' }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { orderId: 42 }));

    const client = new BinanceClient(dualConfig());
    const result = await client.signedPost<{ orderId: number }>('/api/v3/order', {
      symbol: 'USDCBRL',
      side: 'BUY',
      type: 'MARKET',
      quoteOrderQty: '100',
      newClientOrderId: 'orf_order123',
      timestamp: 1,
    });

    expect(result.orderId).toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const first = readCall(fetchMock, 0);
    const second = readCall(fetchMock, 1);
    const firstBody = new URLSearchParams(String(first.init.body));
    const secondBody = new URLSearchParams(String(second.init.body));

    expect(firstBody.get('newClientOrderId')).toBe('orf_order123');
    expect(secondBody.get('newClientOrderId')).toBe('orf_order123');
    expect(firstBody.get('quoteOrderQty')).toBe('100');
    expect(secondBody.get('quoteOrderQty')).toBe('100');
    expect(firstBody.get('signature')).not.toBe(secondBody.get('signature'));
    expect(secondBody.get('signature')).toBe(
      buildSignedBinancePayload(
        new URLSearchParams({
          symbol: 'USDCBRL',
          side: 'BUY',
          type: 'MARKET',
          quoteOrderQty: '100',
          newClientOrderId: 'orf_order123',
          timestamp: '1',
        }),
        'secondary-secret',
      ).split('signature=')[1],
    );
  });

  it('retries signedPostJson on -2015 without changing the JSON body', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(401, { code: -2015, msg: 'Invalid API-key, IP, or permissions for action.' }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { code: '000000', data: { orderId: 'fiat-1' } }));

    const client = new BinanceClient(dualConfig());
    const body = { currency: 'BRL', apiPaymentMethod: 'Pix', amount: 30 };
    await client.signedPostJson('/sapi/v1/fiat/deposit', body, { timestamp: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = readCall(fetchMock, 0);
    const second = readCall(fetchMock, 1);
    expect(JSON.parse(String(first.init.body))).toEqual(body);
    expect(JSON.parse(String(second.init.body))).toEqual(body);
    expect(second.headers.get('X-MBX-APIKEY')).toBe('secondary-key');
  });

  it('does not failover on non-IP Binance errors', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { code: -1121, msg: 'Invalid symbol.' }));

    const client = new BinanceClient(dualConfig());
    await expect(client.signedGet('/api/v3/account', { timestamp: 1 })).rejects.toMatchObject({
      code: -1121,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not failover on timeout', async () => {
    fetchMock.mockImplementation(() => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    });

    const client = new BinanceClient(dualConfig());
    await expect(client.signedPost('/api/v3/order', { timestamp: 1 })).rejects.toMatchObject({
      status: 0,
      code: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not retry -2015 when no secondary profile exists', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { code: -2015, msg: 'Invalid API-key, IP, or permissions for action.' }),
    );

    const client = new BinanceClient({
      baseUrl: 'https://api.binance.com',
      apiKey: 'primary-key',
      apiSecret: 'primary-secret',
      timeoutMs: 5000,
    });

    await expect(client.signedGet('/api/v3/account', { timestamp: 1 })).rejects.toMatchObject({
      code: -2015,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws the second error when both profiles return -2015 and does not stick to the failing profile', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(401, { code: -2015, msg: 'Invalid API-key, IP, or permissions for action.' }),
      )
      .mockResolvedValueOnce(
        jsonResponse(401, { code: -2015, msg: 'Invalid API-key, IP, or permissions for action.' }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const client = new BinanceClient(dualConfig());
    await expect(client.signedGet('/api/v3/account', { timestamp: 1 })).rejects.toMatchObject({
      code: -2015,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const next = new BinanceClient(dualConfig());
    await next.signedGet('/api/v3/account', { timestamp: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(readCall(fetchMock, 2).headers.get('X-MBX-APIKEY')).toBe('primary-key');
  });

  it('sticks to the profile that succeeded so a new client instance starts there', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(401, { code: -2015, msg: 'Invalid API-key, IP, or permissions for action.' }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { accountType: 'SPOT' }))
      .mockResolvedValueOnce(jsonResponse(200, { accountType: 'SPOT' }));

    await new BinanceClient(dualConfig()).signedGet('/api/v3/account', { timestamp: 1 });
    await new BinanceClient(dualConfig()).signedGet('/api/v3/account', { timestamp: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(readCall(fetchMock, 2).headers.get('X-MBX-APIKEY')).toBe('secondary-key');
    expect(readCall(fetchMock, 2).init.dispatcher?.options?.connect?.localAddress).toBe('203.0.113.11');
  });

  it('does not failover public endpoints', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { code: -2015, msg: 'Invalid API-key, IP, or permissions for action.' }),
    );

    const client = new BinanceClient(dualConfig());
    await expect(client.publicGet('/api/v3/ping')).rejects.toMatchObject({ code: -2015 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
