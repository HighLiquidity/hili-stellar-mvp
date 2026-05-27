import type { CorpXAuthManager } from '../auth/auth-manager';
import { getSharedAuthManager } from '../auth/auth-manager';
import { CorpXHttpClient } from '../client/http-client';
import {
  CorpXError,
  CorpXProviderUnavailableError,
  throwAdapterStatusError,
} from '../errors';
import { CorpXPixAdapter } from '../pix/adapter';
import { processCorpXWebhookEvent } from '../webhooks/processor';
import type {
  BalanceRequest,
  BalanceResponse,
  CorpXAdapterConfig,
  LedgerTransactionStatus,
  ProviderInfo,
  Transaction,
  TransactionHistoryRequest,
  TransactionHistoryResponse,
} from './types';
import { loadWebhookAllowlistForAdapter } from './webhook-allowlist';

function assertCorpXAdapterConfig(config: CorpXAdapterConfig): void {
  const missing: string[] = [];
  if (!config.apiBaseURL?.trim()) missing.push('apiBaseURL');
  if (!config.accountId?.trim()) missing.push('accountId');
  if (!config.pixKey?.trim()) missing.push('pixKey');
  if (!config.auth) missing.push('auth');
  if (!config.webhookIpAllowlist) missing.push('webhookIpAllowlist');
  if (missing.length) {
    throw new Error(`corpx adapter requires: ${missing.join(', ')}`);
  }
}

const CORPX_STATUS_FAILED = 'FAILED';
const CORPX_STATUS_REJECTED = 'REJECTED';
const CORPX_STATUS_REVERSED = 'REVERSED';

type BalanceApiRow = {
  accountId?: string;
  total?: number | string;
  locked?: number | string;
  available?: number | string;
  currency?: string;
  updatedAt?: string;
};

type StatementApiRow = {
  status?: string;
  direction?: string;
  amount?: number | string;
  currency?: string;
  description?: string;
  identifier?: string;
  transactionDate?: string;
};

type StatementApiEnvelope = {
  transactions?: StatementApiRow[];
  totalElements?: number;
  hasNext?: boolean;
};

function amountToString(v: unknown): string {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'string' && v.trim()) return v.trim();
  throw new CorpXError('Invalid monetary amount in CorpX response');
}

/** Maps CorpX statement `status` to domain (Go `mapCorpXTransactionStatus`). */
export function mapCorpXTransactionStatus(status: string): LedgerTransactionStatus {
  const s = status.trim().toUpperCase();
  switch (s) {
    case 'COMPLETED':
    case 'PAID':
      return 'completed';
    case 'PENDING':
    case 'PROCESSING':
    case 'APPROVED':
      return 'pending';
    case CORPX_STATUS_FAILED:
    case CORPX_STATUS_REJECTED:
    case CORPX_STATUS_REVERSED:
      return 'failed';
    default:
      return 'pending';
  }
}

/**
 * CorpX BaaS facade: balance, typed statement, provider metadata, health, webhook IP check,
 * plus all PIX operations via {@link CorpXAdapter.pix}.
 * Parity with Go `CorpXAdapter` in adapter.go.
 */
export class CorpXAdapter {
  readonly pix: CorpXPixAdapter;
  readonly accountId: string;
  private readonly client: CorpXHttpClient;
  private readonly auth: CorpXAuthManager;
  private readonly webhookIpAllowlist: ReadonlySet<string>;

  constructor(config: CorpXAdapterConfig) {
    assertCorpXAdapterConfig(config);
    this.accountId = config.accountId;
    this.auth = config.auth;    this.webhookIpAllowlist = config.webhookIpAllowlist;
    this.client = new CorpXHttpClient({
      apiBaseURL: config.apiBaseURL,
      auth: config.auth,
      timeoutMs: config.timeoutMs,
    });
    this.pix = new CorpXPixAdapter(this.client, config.accountId, config.pixKey);
  }

  /**
   * Webhook authenticity by source IP (Go `webhookIPs` map). Payload is not signed by CorpX.
   */
  validateWebhookIp(clientIp: string): boolean {
    if (!clientIp || clientIp === 'unknown') return false;
    return this.webhookIpAllowlist.has(clientIp);
  }

  /**
   * Go parity: IP allowlist only (`payload` ignored).
   */
  validateWebhookSignature(_payload: string | Uint8Array, clientIp: string): boolean {
    return this.validateWebhookIp(clientIp);
  }

  /** Go `ProcessWebhookEvent` — maps CorpX webhook payloads to domain actions. */
  processWebhookEvent(eventType: string, payload: unknown) {
    return processCorpXWebhookEvent(eventType, payload);
  }

  /** GET /v1/accounts/{accountId}/balance */
  async queryBalance(req: BalanceRequest, signal?: AbortSignal): Promise<BalanceResponse> {
    const path = `/v1/accounts/${req.accountId}/balance`;
    let response: Response;
    try {
      response = await this.client.get(path, undefined, signal);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      throw new CorpXProviderUnavailableError(`corpx: ${err.message}`);
    }

    const raw = await response.text().catch(() => '');
    if (!response.ok) {
      throwAdapterStatusError('balance query', response.status, raw || '(empty body)');
    }

    let parsed: BalanceApiRow;
    try {
      parsed = JSON.parse(raw) as BalanceApiRow;
    } catch (er) {
      const msg = er instanceof Error ? er.message : String(er);
      throw new CorpXError(`Failed to parse balance response — ${msg}`, undefined, response.status);
    }

    return {
      accountId: parsed.accountId ?? req.accountId,
      total: amountToString(parsed.total),
      reserved: amountToString(parsed.locked),
      available: amountToString(parsed.available),
      currency: typeof parsed.currency === 'string' ? parsed.currency : 'BRL',
      lastUpdated:
        typeof parsed.updatedAt === 'string' && parsed.updatedAt.trim()
          ? parsed.updatedAt.trim()
          : new Date().toISOString(),
    };
  }

  /**
   * GET /v1/accounts/{accountId}/statement — maps offset → `page` like Go (default page size 50).
   */
  async getTransactionHistory(
    req: TransactionHistoryRequest,
    signal?: AbortSignal,
  ): Promise<TransactionHistoryResponse> {
    const params: Record<string, string | number | undefined | null> = {};

    if (req.startDate && !Number.isNaN(req.startDate.getTime())) {
      params.startDate = req.startDate.toISOString();
    }
    if (req.endDate && !Number.isNaN(req.endDate.getTime())) {
      params.endDate = req.endDate.toISOString();
    }
    if (req.limit != null && req.limit > 0) {
      params.limit = req.limit;
    }
    if (req.offset != null && req.offset > 0) {
      const pageSize = req.limit != null && req.limit > 0 ? req.limit : 50;
      params.page = Math.floor(req.offset / pageSize);
    }

    const path = `/v1/accounts/${req.accountId}/statement`;
    let response: Response;
    try {
      response = await this.client.get(path, params, signal);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      throw new CorpXProviderUnavailableError(`corpx: ${err.message}`);
    }

    const raw = await response.text().catch(() => '');
    if (!response.ok) {
      throwAdapterStatusError('transaction history query', response.status, raw || '(empty body)');
    }

    let envelope: StatementApiEnvelope;
    try {
      envelope = JSON.parse(raw) as StatementApiEnvelope;
    } catch (er) {
      const msg = er instanceof Error ? er.message : String(er);
      throw new CorpXError(`Failed to parse transaction history response — ${msg}`, undefined, response.status);
    }

    const rows = envelope.transactions ?? [];
    const transactions: Transaction[] = rows.map((tx) => {
      const amountStr = amountToString(tx.amount);
      const direction = (tx.direction ?? '').trim().toUpperCase();
      const txType: 'credit' | 'debit' = direction === 'OUT' ? 'debit' : 'credit';
      const identifier = typeof tx.identifier === 'string' ? tx.identifier : '';
      return {
        providerTxId: identifier,
        type: txType,
        amount: amountStr,
        currency: typeof tx.currency === 'string' ? tx.currency : 'BRL',
        description: typeof tx.description === 'string' ? tx.description : '',
        status: mapCorpXTransactionStatus(tx.status ?? ''),
        timestamp:
          typeof tx.transactionDate === 'string' && tx.transactionDate.trim()
            ? tx.transactionDate.trim()
            : new Date().toISOString(),
        referenceId: identifier,
      };
    });

    return {
      transactions,
      totalCount: typeof envelope.totalElements === 'number' ? envelope.totalElements : transactions.length,
      hasMore: Boolean(envelope.hasNext),
    };
  }

  /** Same contract as Go `GetProviderInfo`. */
  getProviderInfo(): ProviderInfo {
    return {
      name: 'corpx',
      type: 'baas',
      version: 'v1',
      capabilities: {
        supportsPIX: true,
        supportsPIXCashOut: true,
        supportsTED: false,
        supportsBoleto: false,
        supportsWebhooks: true,
        supportsBalanceQuery: true,
        supportsTxHistory: true,
      },
      healthStatus: 'healthy',
      lastHealthCheck: new Date().toISOString(),
    };
  }

  /** Same contract as Go `HealthCheck`. */
  healthCheck(): void {
    if (!this.auth.isAuthenticated()) {
      throw new CorpXProviderUnavailableError('corpx: not authenticated');
    }
  }
}

/**
 * Async factory: validates config, logs in, returns adapter (Go `NewCorpXAdapter`).
 */
export async function createCorpXAdapterWithInitialAuth(
  config: CorpXAdapterConfig,
  options?: { signal?: AbortSignal },
): Promise<CorpXAdapter> {
  assertCorpXAdapterConfig(config);
  try {
    await config.auth.login(options?.signal);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`corpx initial authentication failed: ${msg}`, { cause: e });
  }
  return new CorpXAdapter(config);
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

/**
 * Async factory: eager login within 10s (Go `NewCorpXAdapter` startup auth).
 * Reuses {@link getSharedAuthManager} so tokens align with `createCorpXPixAdapterFromEnv`.
 */
export async function createCorpXAdapterFromEnv(options?: {
  signal?: AbortSignal;
}): Promise<CorpXAdapter> {
  const apiBaseURL = process.env.CORPX_API_URL ?? 'https://tenant.api.corpx.com';
  const accountId = process.env.CORPX_ACCOUNT_ID ?? '';
  const pixKey = process.env.CORPX_PIX_KEY ?? '';

  if (!apiBaseURL.trim() || !accountId.trim() || !pixKey.trim()) {
    throw new Error('corpx adapter requires: apiBaseURL, accountId, pixKey (set CORPX_* env vars)');
  }

  const auth = getSharedAuthManager();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    await auth.login(mergeAbortSignals(options?.signal, controller.signal));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`corpx initial authentication failed: ${msg}`, { cause: e });
  } finally {
    clearTimeout(timeout);
  }

  return new CorpXAdapter({
    apiBaseURL,
    auth,
    accountId,
    pixKey,
    webhookIpAllowlist: loadWebhookAllowlistForAdapter(),
  });
}
