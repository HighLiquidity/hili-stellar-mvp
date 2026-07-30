import '@/lib/server/only';

import { assertBinanceCredentials, getBinanceConfig, type BinanceConfig } from './config';
import { BinanceRequestError } from './errors';
import { signBinanceMessage } from './signer';

type BinanceParamValue = string | number | boolean | null | undefined;

export type BinanceRequestParams = Record<string, BinanceParamValue>;
export type BinanceParsedErrorPayload = {
  code: string | number | null;
  message: string;
  details: unknown;
};

type BinanceRequestMethod = 'GET' | 'POST';

/** Pure serializer used by signed/public request builders and unit tests. */
export function serializeBinanceParams(params: BinanceRequestParams = {}): URLSearchParams {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    searchParams.set(key, String(value));
  }

  return searchParams;
}

/** Builds the exact payload string that is both signed and sent to Binance. */
export function buildSignedBinancePayload(params: URLSearchParams, secret: string): string {
  const baseParams = new URLSearchParams(params);
  baseParams.delete('signature');

  const payload = baseParams.toString();
  const signature = signBinanceMessage(payload, secret);

  return payload ? `${payload}&signature=${signature}` : `signature=${signature}`;
}

/** Normalizes Binance/non-Binance error bodies into a stable internal shape. */
export function parseBinanceErrorPayload(text: string): BinanceParsedErrorPayload {
  if (!text) {
    return {
      code: null,
      message: 'Binance request failed with an empty error body',
      details: null,
    };
  }

  try {
    const parsed = JSON.parse(text) as { code?: string | number; msg?: string; message?: string };
    return {
      code: parsed.code ?? null,
      message: parsed.msg ?? parsed.message ?? text.slice(0, 300),
      details: parsed,
    };
  } catch {
    return {
      code: null,
      message: text.slice(0, 300),
      details: text,
    };
  }
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text().catch(() => '');

  if (!response.ok) {
    const error = parseBinanceErrorPayload(text);
    throw new BinanceRequestError(response.status, error.code, error.message, error.details);
  }

  if (!text) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new BinanceRequestError(response.status, null, 'Binance API returned a non-JSON response', text);
  }
}

/**
 * Shared REST client for server-side Binance calls.
 * Uses Node.js runtime primitives and must never be imported from client code.
 */
export class BinanceClient {
  readonly config: BinanceConfig;

  constructor(config: BinanceConfig = getBinanceConfig()) {
    this.config = config;
  }

  async publicGet<T>(path: string, params?: BinanceRequestParams): Promise<T> {
    return this.request<T>('GET', path, params, false);
  }

  async signedGet<T>(path: string, params?: BinanceRequestParams): Promise<T> {
    return this.request<T>('GET', path, params, true);
  }

  async signedPost<T>(path: string, params?: BinanceRequestParams): Promise<T> {
    return this.request<T>('POST', path, params, true);
  }

  /**
   * Signed POST with JSON body (fiat SAPI style).
   * Signs only query params (`timestamp`, optional `recvWindow`); business fields go in the JSON body.
   */
  async signedPostJson<T>(
    path: string,
    body: Record<string, unknown>,
    query: BinanceRequestParams = {},
  ): Promise<T> {
    const config = this.config;
    assertBinanceCredentials(config);

    const url = new URL(path, `${this.config.baseUrl}/`);
    const searchParams = serializeBinanceParams(query);
    if (!searchParams.has('timestamp')) {
      searchParams.set('timestamp', String(Date.now()));
    }

    url.search = buildSignedBinancePayload(searchParams, config.apiSecret);

    const headers = new Headers({
      'X-MBX-APIKEY': config.apiKey,
      'Content-Type': 'application/json',
    });

    return this.executeFetch<T>('POST', url, headers, JSON.stringify(body));
  }

  private async request<T>(
    method: BinanceRequestMethod,
    path: string,
    params: BinanceRequestParams = {},
    signed: boolean,
  ): Promise<T> {
    const url = new URL(path, `${this.config.baseUrl}/`);
    const headers = new Headers();
    const searchParams = serializeBinanceParams(params);
    let body: string | undefined;

    if (signed) {
      const config = this.config;
      assertBinanceCredentials(config);

      headers.set('X-MBX-APIKEY', config.apiKey);

      if (!searchParams.has('timestamp')) {
        searchParams.set('timestamp', String(Date.now()));
      }

      const signedPayload = buildSignedBinancePayload(searchParams, config.apiSecret);
      if (method === 'GET') {
        url.search = signedPayload;
      } else {
        headers.set('Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8');
        body = signedPayload;
      }
    } else if (searchParams.size > 0) {
      url.search = searchParams.toString();
    }

    return this.executeFetch<T>(method, url, headers, body);
  }

  private async executeFetch<T>(
    method: BinanceRequestMethod,
    url: URL,
    headers: Headers,
    body?: string,
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        method,
        headers,
        body,
        signal: controller.signal,
        cache: 'no-store',
      });

      return parseJsonResponse<T>(response);
    } catch (error) {
      if (error instanceof BinanceRequestError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new BinanceRequestError(
          0,
          null,
          `Binance request timed out after ${this.config.timeoutMs}ms`,
          null,
        );
      }

      throw new BinanceRequestError(
        0,
        null,
        error instanceof Error ? error.message : 'Unknown Binance request error',
        null,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export function createBinanceClient(config: BinanceConfig = getBinanceConfig()): BinanceClient {
  return new BinanceClient(config);
}
