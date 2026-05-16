/**
 * OAuth2 Client Credentials token management for CorpX API.
 * CorpX does not issue refresh tokens — renewal is a full token request.
 *
 * Server-only: import this only from Route Handlers, Server Actions, or other server code.
 */

export type CorpXTokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
};

export type AuthManagerConfig = {
  /** Base URL, e.g. https://auth.corpxapi.com (path /oauth2/token is appended). */
  authURL: string;
  clientID: string;
  clientSecret: string;
  tenantID: string;
  /** HTTP timeout in ms (default 30_000). */
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const RENEWAL_BUFFER_MS = 5 * 60 * 1000;

export class CorpXAuthManager {
  private readonly tokenEndpoint: string;
  private readonly clientID: string;
  private readonly clientSecret: string;
  private readonly tenantID: string;
  private readonly timeoutMs: number;

  private accessToken: string | null = null;
  /** Epoch ms when the token is considered expired (from CorpX expires_in). */
  private expiresAtMs = 0;

  /**
   * Async mutex: only one refresh runs at a time; others wait then re-check (double-check).
   */
  private mutex: Promise<void> = Promise.resolve();

  constructor(config: AuthManagerConfig) {
    const base = config.authURL.replace(/\/+$/, '');
    this.tokenEndpoint = `${base}/oauth2/token`;
    this.clientID = config.clientID;
    this.clientSecret = config.clientSecret;
    this.tenantID = config.tenantID;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Obtains a new access token (full client_credentials grant).
   */
  async login(signal?: AbortSignal): Promise<void> {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientID,
      client_secret: this.clientSecret,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const merged = mergeAbortSignals(signal, controller.signal);

    let response: Response;
    try {
      response = await fetch(this.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: merged,
      });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      throw new Error(`CorpX login request failed: ${err.message}`, { cause: e });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      let detail = '';
      try {
        detail = await response.text();
      } catch {
        /* ignore */
      }
      throw new Error(
        `CorpX login failed: HTTP ${response.status}${detail ? ` — ${detail.slice(0, 500)}` : ''}`,
      );
    }

    let tokenResp: CorpXTokenResponse;
    try {
      tokenResp = (await response.json()) as CorpXTokenResponse;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      throw new Error(`CorpX login: failed to decode login response — ${err.message}`, { cause: e });
    }

    if (!tokenResp.access_token) {
      throw new Error('CorpX login: missing access_token in response');
    }

    const expiresInSec = typeof tokenResp.expires_in === 'number' ? tokenResp.expires_in : 3600;
    this.accessToken = tokenResp.access_token;
    this.expiresAtMs = Date.now() + expiresInSec * 1000;
  }

  /** Alias for {@link login}; CorpX has no refresh grant. */
  async refreshToken(signal?: AbortSignal): Promise<void> {
    return this.login(signal);
  }

  /**
   * Ensures a valid bearer token and sets `Authorization` and `X-Tenant-Id` on `headers`.
   */
  async addAuthHeader(headers: Headers, signal?: AbortSignal): Promise<void> {
    if (this.needsRefresh()) {
      await this.withRefreshLock(async () => {
        if (this.needsRefresh()) {
          await this.refreshToken(signal);
        }
      });
    }

    const token = this.accessToken;
    if (!token) {
      throw new Error('CorpX auth: no access token after refresh');
    }

    headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-Tenant-Id', this.tenantID);
  }

  isAuthenticated(): boolean {
    return Boolean(this.accessToken) && Date.now() < this.expiresAtMs;
  }

  /**
   * Test seam: set token expiry without going through the token endpoint.
   * @internal
   */
  dangerouslySetTokenForTests(accessToken: string | null, expiresAtMs: number): void {
    this.accessToken = accessToken;
    this.expiresAtMs = expiresAtMs;
  }

  private needsRefresh(): boolean {
    const now = Date.now();
    return !this.accessToken || now + RENEWAL_BUFFER_MS >= this.expiresAtMs;
  }

  private async withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.mutex;
    let release!: () => void;
    this.mutex = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export function createAuthManagerFromEnv(): CorpXAuthManager {
  const authURL = process.env.CORPX_AUTH_URL ?? 'https://auth.corpxapi.com';
  const clientID = process.env.CORPX_CLIENT_ID ?? '';
  const clientSecret = process.env.CORPX_CLIENT_SECRET ?? '';
  const tenantID = process.env.CORPX_TENANT_ID ?? '';

  if (!clientID || !clientSecret || !tenantID) {
    throw new Error(
      'CorpX auth: set CORPX_CLIENT_ID, CORPX_CLIENT_SECRET, and CORPX_TENANT_ID in the server environment',
    );
  }

  return new CorpXAuthManager({ authURL, clientID, clientSecret, tenantID });
}

let sharedAuthManager: CorpXAuthManager | null = null;

/**
 * Reuses one {@link CorpXAuthManager} per Node process so the access token stays cached
 * across Route Handler calls (same behavior as a long-lived Go service).
 */
export function getSharedAuthManager(): CorpXAuthManager {
  if (!sharedAuthManager) {
    sharedAuthManager = createAuthManagerFromEnv();
  }
  return sharedAuthManager;
}

export function resetSharedAuthManagerForTests(): void {
  sharedAuthManager = null;
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
