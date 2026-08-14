import { getSharedAuthManager } from '../auth/auth-manager';
import { CorpXHttpClient } from '../client/http-client';
import { clampCorpXPixExpirationDate } from './expiration';
import { normalizeCorpXPixIdentifier } from './identifier';
import {
  CorpXError,
  CorpXIdempotencyConflictError,
  CorpXInsufficientFundsError,
  CorpXInvalidRequestError,
  CorpXProviderUnavailableError,
  CorpXTransactionNotFoundError,
  parseCorpXErrorJson,
  throwStatusError,
} from '../errors';
import { parsePixEmv } from '@/lib/pix/emv-parser';
import { brlStringToJsonNumber } from './brl';
import type {
  CashOutTransactionStatus,
  DecodedPaymentQr,
  DynamicPIXRequest,
  PayPaymentQrRequest,
  PIXCashOutRequest,
  PIXCashOutResponse,
  PIXResponse,
  StatementQuery,
  StaticPIXRequest,
  TEDRequest,
  TransferRequest,
  TransferResponse,
  TransferStatus,
} from './types';

/** Amount above which BigPIX is used (R$ 15.000,00) — same as Go `bigPIXThreshold`. */
const BIG_PIX_THRESHOLD = 15_000;

const BIGPIX_STATUS_PARTIAL = 'PARTIAL';
const BIGPIX_STATUS_FAILED = 'FAILED';

type DynamicQrApiResponse = {
  txid?: string;
  emv?: string;
  identifier?: string;
  status?: string;
  type?: string;
  value?: number | string;
  message?: string;
  expiresAt?: string;
  createdAt?: string;
  chave?: string;
  pixKey?: string;
};

type StaticQrApiResponse = {
  txid?: string;
  emv?: string;
  identifier?: string;
  status?: string;
  type?: string;
  value?: number | string;
  message?: string;
  expiresAt?: string;
  createdAt?: string;
  chave?: string;
  pixKey?: string;
};

type CashOutApiResponse = {
  transactionId?: string;
  status?: string;
  endToEndId?: string;
  amount?: number | string;
  value?: number | string;
  currency?: string;
};

type PixTransactionLookupResponse = {
  transactionId?: string;
  endToEndId?: string;
  status?: string;
  transactionDate?: string;
  description?: string;
};

type BigPixApiResponse = {
  bigPixId?: string;
  paymentId?: string;
  requestedAmount?: number | string;
  executedAmount?: number | string;
  status?: string;
  transfers?: Array<{ endToEndId?: string }>;
};

export class CorpXPixAdapter {
  constructor(
    private readonly client: CorpXHttpClient,
    private readonly accountId: string,
    /** Default receiving PIX key for QR generation (must be registered on the account). */
    private readonly pixKey: string,
  ) {}

  async generateDynamicPIX(req: DynamicPIXRequest, signal?: AbortSignal): Promise<PIXResponse> {
    const path = `/v1/accounts/${this.accountId}/pix/qr-code/dynamic`;

    const body = {
      pixKey: this.pixKey,
      value: brlStringToJsonNumber(req.amount),
      expirationDate: toRfc3339Utc(clampCorpXPixExpirationDate(req.expiresAt)),
      identifier: normalizeCorpXPixIdentifier(req.correlationId),
      ...(req.description ? { message: req.description } : {}),
    };

    let response: Response;
    try {
      response = await this.client.postIdempotentJSON(path, body, req.idempotencyKey, signal);
    } catch (e) {
      if (e instanceof CorpXError) throw e;
      const err = e instanceof Error ? e : new Error(String(e));
      throw new CorpXProviderUnavailableError(`corpx: ${err.message}`);
    }

    const raw = await readBodyOrThrow(response, 'PIX dynamic QR');

    if (response.status !== 200 && response.status !== 201) {
      this.handlePIXQrError(response.status, raw);
    }

    let parsed: DynamicQrApiResponse;
    try {
      parsed = JSON.parse(raw) as DynamicQrApiResponse;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      throw new CorpXError(`Failed to parse PIX dynamic response: ${err.message}`, undefined, response.status);
    }

    if (!parsed.txid || !parsed.emv) {
      throw new CorpXError('CorpX PIX dynamic response missing data fields', undefined, response.status, raw.slice(0, 500));
    }

    return {
      providerTxId: parsed.txid,
      qrCode: parsed.emv,
      pixKey: parsed.pixKey ?? parsed.chave ?? this.pixKey,
      amount: req.amount,
      expiresAt: parsed.expiresAt ? toIsoOrNull(new Date(parsed.expiresAt)) : toIsoOrNull(req.expiresAt),
      status: 'active',
    };
  }

  async generateStaticPIX(req: StaticPIXRequest, signal?: AbortSignal): Promise<PIXResponse> {
    const path = `/v1/accounts/${this.accountId}/pix/qr-code/static`;

    const body = {
      pixKey: this.pixKey,
      identifier: normalizeCorpXPixIdentifier(req.idempotencyKey),
      ...(req.description ? { message: req.description } : {}),
    };

    let response: Response;
    try {
      response = await this.client.postIdempotentJSON(path, body, req.idempotencyKey, signal);
    } catch (e) {
      if (e instanceof CorpXError) throw e;
      const err = e instanceof Error ? e : new Error(String(e));
      throw new CorpXProviderUnavailableError(`corpx: ${err.message}`);
    }

    const raw = await readBodyOrThrow(response, 'PIX static QR');

    if (response.status !== 200 && response.status !== 201) {
      this.handlePIXQrError(response.status, raw);
    }

    let parsed: StaticQrApiResponse;
    try {
      parsed = JSON.parse(raw) as StaticQrApiResponse;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      throw new CorpXError(`Failed to parse PIX static response: ${err.message}`, undefined, response.status);
    }

    if (!parsed.txid || !parsed.emv) {
      throw new CorpXError('CorpX PIX static response missing data fields', undefined, response.status, raw.slice(0, 500));
    }

    return {
      providerTxId: parsed.txid,
      qrCode: parsed.emv,
      pixKey: parsed.pixKey ?? parsed.chave ?? this.pixKey,
      amount: '0',
      expiresAt: parsed.expiresAt ? toIsoOrNull(new Date(parsed.expiresAt)) : null,
      status: 'active',
    };
  }

  async initiatePIXCashOut(req: PIXCashOutRequest, signal?: AbortSignal): Promise<PIXCashOutResponse> {
    if (brlStringToJsonNumber(req.amount) > BIG_PIX_THRESHOLD) {
      return this.initiateBigPIX(req, signal);
    }

    const path = `/v1/accounts/${this.accountId}/pix/out`;

    const body = {
      accountId: this.accountId,
      amount: brlStringToJsonNumber(req.amount),
      currency: 'BRL',
      keyType: req.pixKeyType,
      key: req.pixKey,
      ...(req.description ? { description: req.description } : {}),
      ...(req.correlationId ? { identifier: normalizeCorpXPixIdentifier(req.correlationId) } : {}),
    };

    let response: Response;
    try {
      response = await this.client.postIdempotentJSON(path, body, req.idempotencyKey, signal);
    } catch (e) {
      if (e instanceof CorpXError) throw e;
      const err = e instanceof Error ? e : new Error(String(e));
      throw new CorpXProviderUnavailableError(`corpx: ${err.message}`);
    }

    const raw = await readBodyOrThrow(response, 'PIX cash out');

    if (response.status !== 200 && response.status !== 201 && response.status !== 202) {
      throwPIXCashOutError(response.status, raw);
    }

    let parsed: CashOutApiResponse;
    try {
      parsed = JSON.parse(raw) as CashOutApiResponse;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      throw new CorpXError(`Failed to parse PIX cash out response: ${err.message}`, undefined, response.status);
    }

    const amountStr = amountToStringOrFallback(parsed.amount, 'PIX cash out amount', req.amount);

    return {
      providerTxId: parsed.transactionId ?? '',
      e2eId: parsed.endToEndId ?? '',
      status: mapCorpXCashOutSubmitStatus(parsed.status),
      amount: amountStr,
      fee: '0',
    };
  }

  private async initiateBigPIX(req: PIXCashOutRequest, signal?: AbortSignal): Promise<PIXCashOutResponse> {
    const path = `/v1/accounts/${this.accountId}/pix/out/bigpix`;

    const body = {
      key: req.pixKey,
      keyType: req.pixKeyType,
      amount: brlStringToJsonNumber(req.amount),
      ...(req.description ? { description: req.description } : {}),
      ...(req.correlationId ? { identifier: normalizeCorpXPixIdentifier(req.correlationId) } : {}),
    };

    let response: Response;
    try {
      response = await this.client.postIdempotentJSON(path, body, req.idempotencyKey, signal);
    } catch (e) {
      if (e instanceof CorpXError) throw e;
      const err = e instanceof Error ? e : new Error(String(e));
      throw new CorpXProviderUnavailableError(`corpx: ${err.message}`);
    }

    const raw = await readBodyOrThrow(response, 'BigPIX');

    if (response.status !== 200 && response.status !== 201 && response.status !== 202) {
      throwPIXCashOutError(response.status, raw);
    }

    let parsed: BigPixApiResponse;
    try {
      parsed = JSON.parse(raw) as BigPixApiResponse;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      throw new CorpXError(`Failed to parse BigPIX response: ${err.message}`, undefined, response.status);
    }

    const executedAmountStr = amountToString(parsed.executedAmount, 'BigPIX executed amount');

    let status: CashOutTransactionStatus = 'completed';
    const st = (parsed.status ?? '').toUpperCase();
    if (st === BIGPIX_STATUS_PARTIAL) {
      status = 'requires_reconciliation';
    } else if (st === BIGPIX_STATUS_FAILED) {
      status = 'failed';
    }

    let e2eId = '';
    const transfers = parsed.transfers;
    if (transfers && transfers.length > 0 && transfers[0]?.endToEndId) {
      e2eId = transfers[0].endToEndId;
    }

    const providerTxId = parsed.bigPixId ?? parsed.paymentId ?? '';

    return {
      providerTxId,
      e2eId,
      status,
      amount: executedAmountStr,
      fee: '0',
    };
  }

  async getTransactionHistory(query: StatementQuery = {}, signal?: AbortSignal): Promise<unknown> {
    const path = `/v1/accounts/${this.accountId}/statement`;
    const response = await this.client.get(
      path,
      {
        page: query.page,
        size: query.size,
        limit: query.limit,
        order: query.order,
        startDate: query.startDate,
        endDate: query.endDate,
      },
      signal,
    );

    const raw = await response.text().catch(() => '');
    if (!response.ok) {
      throwStatusError('corpx: statement', response.status, raw || '(empty body)');
    }

    try {
      return JSON.parse(raw) as unknown;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      throw new CorpXError(`Failed to parse statement JSON — ${err.message}`, undefined, response.status);
    }
  }

  /**
   * CorpX only supports PIX for outbound transfers — delegates to {@link initiatePIXCashOut}
   * with `pixKeyType` EVP and `creditAccountId` as destination key (same as Go `InitiateTransfer`).
   */
  async initiateTransfer(req: TransferRequest, signal?: AbortSignal): Promise<TransferResponse> {
    if (normalizeAccountId(req.debitAccountId) !== normalizeAccountId(this.accountId)) {
      throw new CorpXInvalidRequestError(
        `Transfer debitAccountId must match configured CorpX account (expected ${this.accountId})`,
      );
    }

    const pix = await this.initiatePIXCashOut(
      {
        idempotencyKey: req.idempotencyKey,
        amount: req.amount,
        pixKeyType: 'EVP',
        pixKey: req.creditAccountId,
        description: req.description,
        correlationId: req.correlationId,
      },
      signal,
    );

    return {
      providerTxId: pix.providerTxId,
      e2eId: pix.e2eId,
      status: pix.status,
      amount: pix.amount,
      fee: pix.fee,
    };
  }

  /**
   * CorpX does not support TED (Wire) transfers — mirrors Go `InitiateTED`.
   */
  async initiateTED(req: TEDRequest): Promise<never> {
    void req;
    throw new CorpXProviderUnavailableError('corpx: TED not supported');
  }

  /**
   * `GET .../pix/transactions?endToEndId=...` (CorpX guide).
   * Go `GetTransferStatus` names the parameter `providerTxID` but sends it as `endToEndId`.
   */
  async getTransferStatus(endToEndId: string, signal?: AbortSignal): Promise<TransferStatus> {
    const trimmed = endToEndId.trim();
    if (!trimmed) {
      throw new CorpXInvalidRequestError('getTransferStatus requires a non-empty endToEndId');
    }

    const path = `/v1/accounts/${this.accountId}/pix/transactions`;
    let response: Response;
    try {
      response = await this.client.get(path, { endToEndId: trimmed }, signal);
    } catch (e) {
      if (e instanceof CorpXError) throw e;
      const err = e instanceof Error ? e : new Error(String(e));
      throw new CorpXProviderUnavailableError(`corpx: ${err.message}`);
    }

    const raw = await response.text().catch(() => '');
    if (response.status === 404) {
      throw new CorpXTransactionNotFoundError(
        `PIX transaction not found for endToEndId: ${trimmed}`,
        trimmed,
        undefined,
        404,
        raw.slice(0, 500),
      );
    }

    if (!response.ok) {
      throwStatusError('corpx: get transfer status', response.status, raw || '(empty body)');
    }

    let parsed: PixTransactionLookupResponse;
    try {
      parsed = JSON.parse(raw) as PixTransactionLookupResponse;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      throw new CorpXError(`Failed to parse transfer status response — ${err.message}`, undefined, response.status);
    }

    const status = mapCorpXTransferLookupStatus(parsed.status);

    const updatedAt = typeof parsed.transactionDate === 'string' && parsed.transactionDate.trim()
      ? parsed.transactionDate.trim()
      : new Date().toISOString();

    return {
      providerTxId: parsed.transactionId?.trim() ?? '',
      e2eId: parsed.endToEndId?.trim() ?? trimmed,
      status,
      updatedAt,
      ...(typeof parsed.description === 'string' ? { description: parsed.description } : {}),
    };
  }


  async decodePaymentQrEmv(emv: string, signal?: AbortSignal): Promise<DecodedPaymentQr> {
    const path = `/v1/accounts/${this.accountId}/pix/out/qr-code/decode`;

    let response: Response;
    try {
      response = await this.client.post(path, { emv: emv.trim() }, signal);
    } catch (e) {
      if (e instanceof CorpXError) throw e;
      const err = e instanceof Error ? e : new Error(String(e));
      throw new CorpXProviderUnavailableError(`corpx: ${err.message}`);
    }

    const raw = await readBodyOrThrow(response, 'PIX QR decode');

    if (response.status !== 200 && response.status !== 201) {
      throwStatusError('corpx: PIX QR decode', response.status, raw);
    }

    let parsed: {
      amount?: number | string;
      key?: string;
      beneficiaryName?: string;
      allowChange?: boolean;
    };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      throw new CorpXError(`Failed to parse PIX QR decode response: ${err.message}`, undefined, response.status);
    }

    let amountBrl: string | null = null;
    if (parsed.amount != null) {
      try {
        amountBrl = amountToString(parsed.amount, 'decoded QR amount');
      } catch {
        amountBrl = null;
      }
    }

    return {
      amountBrl,
      pixKey: typeof parsed.key === 'string' && parsed.key.trim() ? parsed.key.trim() : null,
      beneficiaryName:
        typeof parsed.beneficiaryName === 'string' && parsed.beneficiaryName.trim()
          ? parsed.beneficiaryName.trim()
          : null,
      allowChange: Boolean(parsed.allowChange),
    };
  }

  async payPaymentQrEmv(req: PayPaymentQrRequest, signal?: AbortSignal): Promise<PIXCashOutResponse> {
    const path = `/v1/accounts/${this.accountId}/pix/out/qr-code`;

    const body: Record<string, unknown> = {
      accountId: this.accountId,
      emv: req.emv.trim(),
      ...(req.description ? { description: req.description } : {}),
      ...(req.correlationId ? { identifier: normalizeCorpXPixIdentifier(req.correlationId) } : {}),
    };

    if (req.amount?.trim()) {
      body.amount = brlStringToJsonNumber(req.amount.trim());
    }

    let response: Response;
    try {
      response = await this.client.postIdempotentJSON(path, body, req.idempotencyKey, signal);
    } catch (e) {
      if (e instanceof CorpXError) throw e;
      const err = e instanceof Error ? e : new Error(String(e));
      throw new CorpXProviderUnavailableError(`corpx: ${err.message}`);
    }

    const raw = await readBodyOrThrow(response, 'PIX QR payment');

    if (response.status !== 200 && response.status !== 201 && response.status !== 202) {
      throwPIXCashOutError(response.status, raw);
    }

    let parsed: CashOutApiResponse;
    try {
      parsed = JSON.parse(raw) as CashOutApiResponse;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      throw new CorpXError(`Failed to parse PIX QR payment response: ${err.message}`, undefined, response.status);
    }

    const amountStr = resolveQrPaymentAmount({
      parsed,
      requestAmount: req.amount,
      amountHint: req.amountHint,
      emv: req.emv,
    });

    return {
      providerTxId: parsed.transactionId ?? '',
      e2eId: parsed.endToEndId ?? '',
      status: mapCorpXCashOutSubmitStatus(parsed.status),
      amount: amountStr,
      fee: '0',
    };
  }

  private handlePIXQrError(statusCode: number, body: string): never {
    if (statusCode === 409) {
      const parsed = parseCorpXErrorJson(body);
      throw new CorpXIdempotencyConflictError(
        parsed.message?.trim() || 'Idempotency conflict',
        parsed.errorCode ?? parsed.code,
        statusCode,
        body.slice(0, 500),
      );
    }
    throwStatusError('corpx: PIX QR generation', statusCode, body);
  }
}

/** Go `mapCorpXStatus` — cash-out / transfer *submission* responses. */
export function mapCorpXCashOutSubmitStatus(status: string | undefined): CashOutTransactionStatus {
  const s = (status ?? '').toUpperCase();
  switch (s) {
    case 'APPROVED':
    case 'PENDING':
    case 'PROCESSING':
    case 'SCHEDULED':
      return 'submitted';
    case 'COMPLETED':
      return 'completed';
    case 'REJECTED':
    case 'FAILED':
    case 'REVERSED':
      return 'failed';
    default:
      return 'pending';
  }
}

/** Same as {@link mapCorpXCashOutSubmitStatus} (Go name parity). */
export const mapCorpXStatus = mapCorpXCashOutSubmitStatus;

/** Go `GetTransferStatus` / `mapCorpXTransactionStatus` alignment for PIX transaction lookup. */
export function mapCorpXTransferLookupStatus(status: string | undefined): CashOutTransactionStatus {
  const s = (status ?? '').toUpperCase();
  switch (s) {
    case 'COMPLETED':
    case 'PAID':
      return 'completed';
    case 'PENDING':
    case 'PROCESSING':
    case 'APPROVED':
      return 'pending';
    case 'REJECTED':
    case 'FAILED':
    case 'REVERSED':
      return 'failed';
    default:
      return 'pending';
  }
}

/** @deprecated Use {@link mapCorpXCashOutSubmitStatus} or {@link mapCorpXTransferLookupStatus}. */
export function mapCorpXCashOutStatus(status: string | undefined): CashOutTransactionStatus {
  return mapCorpXCashOutSubmitStatus(status);
}

function insufficientFundsCorpCode(code: string | undefined): boolean {
  const n = (code ?? '').trim().toUpperCase().replace(/-/g, '_');
  return n === 'INSUFFICIENT_BALANCE' || n === 'INSUFFICIENT_FUNDS';
}

/** Exposed for tests (Go `handlePIXCashOutError`). */
export function throwPIXCashOutError(statusCode: number, body: string): never {
  const parsed = parseCorpXErrorJson(body);
  const code = parsed.errorCode ?? parsed.code;

  if (statusCode === 409) {
    if (insufficientFundsCorpCode(code)) {
      throw new CorpXInsufficientFundsError(
        parsed.message?.trim() || 'Insufficient balance',
        code,
        statusCode,
        body.slice(0, 500),
      );
    }
    throw new CorpXIdempotencyConflictError(
      parsed.message?.trim() || 'Idempotency conflict',
      code,
      statusCode,
      body.slice(0, 500),
    );
  }

  if (statusCode === 422) {
    if (insufficientFundsCorpCode(code)) {
      throw new CorpXInsufficientFundsError(
        parsed.message?.trim() || 'Insufficient balance',
        code,
        statusCode,
        body.slice(0, 500),
      );
    }
    throw new CorpXInvalidRequestError(
      parsed.message?.trim() || 'Unprocessable PIX cash out request',
      code,
      statusCode,
      body.slice(0, 500),
    );
  }

  throwStatusError('corpx: PIX cash out', statusCode, body);
}

function normalizeAccountId(id: string): string {
  return id.trim().toLowerCase();
}

function toRfc3339Utc(d: Date): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    throw new CorpXInvalidRequestError('Invalid expiration date');
  }
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function toIsoOrNull(d: Date): string | null {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function readBodyOrThrow(response: Response, context: string): Promise<string> {
  try {
    return await response.text();
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    throw new CorpXProviderUnavailableError(`${context}: failed to read body — ${err.message}`);
  }
}

function amountToString(value: unknown, label: string): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  throw new CorpXError(`Failed to parse ${label}`);
}

function amountToStringOrFallback(value: unknown, label: string, fallback: string): string {
  try {
    return amountToString(value, label);
  } catch {
    const trimmedFallback = fallback.trim();
    if (trimmedFallback) {
      return trimmedFallback;
    }
    throw new CorpXError(`Failed to parse ${label}`);
  }
}

function amountFromEmvTag54(emv: string): string {
  const parsed = parsePixEmv(emv);
  if (parsed.ok && parsed.data.amountBrl) {
    return parsed.data.amountBrl;
  }
  return '';
}

function pickCashOutAmount(parsed: CashOutApiResponse): unknown {
  if (parsed.amount != null) return parsed.amount;
  if (parsed.value != null) return parsed.value;
  return undefined;
}

/**
 * CorpX often omits `amount` on PIX QR-out 2xx when the EMV already has tag 54.
 * Throwing here used to fail treasury after the payment was already accepted.
 */
function resolveQrPaymentAmount(input: {
  parsed: CashOutApiResponse;
  requestAmount?: string;
  amountHint?: string;
  emv: string;
}): string {
  const candidates: unknown[] = [
    pickCashOutAmount(input.parsed),
    input.requestAmount,
    amountFromEmvTag54(input.emv),
    input.amountHint,
  ];

  for (const candidate of candidates) {
    try {
      return amountToString(candidate, 'PIX QR payment amount');
    } catch {
      // try next source
    }
  }

  const hasIds = Boolean(
    input.parsed.transactionId?.trim() || input.parsed.endToEndId?.trim(),
  );
  if (hasIds) {
    return '0';
  }
  throw new CorpXError('Failed to parse PIX QR payment amount');
}

export function createCorpXPixAdapterFromEnv(): CorpXPixAdapter {
  const apiBaseURL = process.env.CORPX_API_URL ?? 'https://tenant.api.corpx.com';
  const accountId = process.env.CORPX_ACCOUNT_ID ?? '';
  const pixKey = process.env.CORPX_PIX_KEY ?? '';

  if (!accountId || !pixKey) {
    throw new Error(
      'CorpX PIX: set CORPX_ACCOUNT_ID and CORPX_PIX_KEY in the server environment',
    );
  }

  const httpClient = new CorpXHttpClient({
    apiBaseURL,
    auth: getSharedAuthManager(),
  });

  return new CorpXPixAdapter(httpClient, accountId, pixKey);
}
