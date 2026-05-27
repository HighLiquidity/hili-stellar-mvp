import type { CorpXAuthManager } from '../auth/auth-manager';
import { CorpXProviderUnavailableError } from '../errors';

const DEFAULT_TIMEOUT_MS = 60_000;

export type CorpXHttpClientConfig = {
  /** e.g. https://tenant.api.corpx.com */
  apiBaseURL: string;
  auth: CorpXAuthManager;
  timeoutMs?: number;
};

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

function mergeAbortSignals(a?: AbortSignal, b?: AbortSignal): AbortSignal | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;

  const controller = new AbortController();
  const onAbort = () => controller.abort();

  if (a.aborted || b.aborted) {
    controller.abort();
    return controller.signal;
  }

  a.addEventListener('abort', onAbort, { once: true });
  b.addEventListener('abort', onAbort, { once: true });

  return controller.signal;
}

function serializeJsonBody(body: string | object): string {
  return typeof body === 'string' ? body : JSON.stringify(body);
}

/**
 * CorpX HTTP facade (parity with Go `corpx.HTTPClient` wrapping `banking.HTTPClient`).
 * - Adds `Authorization` + `X-Tenant-Id` via {@link CorpXAuthManager#addAuthHeader}.
 * - `postIdempotent` sets `Idempotency-Key` when non-empty (Go omits empty key).
 *
 * Exponential backoff on 5xx is not implemented here (was on Go `banking.HTTPClient`); add at call site or extend this class if needed.
 * Server-only.
 */
export class CorpXHttpClient {
  private readonly apiBaseURL: string;
  private readonly auth: CorpXAuthManager;
  private readonly timeoutMs: number;

  constructor(config: CorpXHttpClientConfig) {
    this.apiBaseURL = config.apiBaseURL.replace(/\/+$/, '');
    this.auth = config.auth;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * GET — same idea as Go `HTTPClient.Get` / `inner.Get`.
   */
  async get(
    path: string,
    searchParams?: Record<string, string | number | undefined | null>,
    signal?: AbortSignal,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const merged = mergeAbortSignals(signal, controller.signal);

    const headers = new Headers({ Accept: 'application/json' });

    try {
      await this.auth.addAuthHeader(headers, merged);
    } catch (e) {
      clearTimeout(timeout);
      const err = e instanceof Error ? e : new Error(String(e));
      throw new CorpXProviderUnavailableError(`CorpX auth failed: ${err.message}`, undefined, undefined);
    }

    const qs = new URLSearchParams();
    if (searchParams) {
      for (const [k, v] of Object.entries(searchParams)) {
        if (v === undefined || v === null) continue;
        qs.set(k, String(v));
      }
    }
    const query = qs.toString();
    const url = `${joinUrl(this.apiBaseURL, path)}${query ? `?${query}` : ''}`;

    let response: Response;
    try {
      response = await fetch(url, { method: 'GET', headers, signal: merged });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      throw new CorpXProviderUnavailableError(`CorpX request failed: ${err.message}`, undefined, undefined);
    } finally {
      clearTimeout(timeout);
    }

    return response;
  }

  /**
   * POST without `Idempotency-Key` — same idea as Go `HTTPClient.Post`.
   */
  async post(path: string, body: string | object, signal?: AbortSignal): Promise<Response> {
    return this.postWithHeaders(path, serializeJsonBody(body), {
      idempotencyKey: undefined,
      signal,
    });
  }

  /**
   * POST with optional `Idempotency-Key` header (set only if `idempotencyKey` is non-empty after trim) — Go `PostIdempotent`.
   */
  async postIdempotent(
    path: string,
    body: string | object,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<Response> {
    return this.postWithHeaders(path, serializeJsonBody(body), {
      idempotencyKey,
      signal,
    });
  }

  /**
   * Convenience: JSON object body + required idempotency key (CorpX mutating endpoints).
   */
  async postIdempotentJSON<TBody extends object>(
    path: string,
    body: TBody,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<Response> {
    return this.postIdempotent(path, body, idempotencyKey, signal);
  }

  private async postWithHeaders(
    path: string,
    bodySerialized: string,
    options: {
      idempotencyKey: string | undefined;
      signal?: AbortSignal;
    },
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const merged = mergeAbortSignals(options.signal, controller.signal);

    const headers = new Headers({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });

    if (options.idempotencyKey !== undefined) {
      const k = options.idempotencyKey.trim();
      if (k) headers.set('Idempotency-Key', k);
    }

    try {
      await this.auth.addAuthHeader(headers, merged);
    } catch (e) {
      clearTimeout(timeout);
      const err = e instanceof Error ? e : new Error(String(e));
      throw new CorpXProviderUnavailableError(`CorpX auth failed: ${err.message}`, undefined, undefined);
    }

    let response: Response;
    try {
      response = await fetch(joinUrl(this.apiBaseURL, path), {
        method: 'POST',
        headers,
        body: bodySerialized,
        signal: merged,
      });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      throw new CorpXProviderUnavailableError(`CorpX request failed: ${err.message}`, undefined, undefined);
    } finally {
      clearTimeout(timeout);
    }

    return response;
  }
}
