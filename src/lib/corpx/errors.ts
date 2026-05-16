export type CorpXErrorJson = {
  errorCode?: string;
  code?: string;
  message?: string;
  field?: string;
};

export function parseCorpXErrorJson(body: string): CorpXErrorJson {
  try {
    return JSON.parse(body) as CorpXErrorJson;
  } catch {
    return {};
  }
}

export class CorpXError extends Error {
  constructor(
    message: string,
    public readonly corpCode?: string,
    public readonly httpStatus?: number,
    public readonly bodySnippet?: string,
  ) {
    super(message);
    this.name = 'CorpXError';
  }
}

export class CorpXIdempotencyConflictError extends CorpXError {
  constructor(message: string, corpCode?: string, httpStatus?: number, bodySnippet?: string) {
    super(message, corpCode, httpStatus, bodySnippet);
    this.name = 'CorpXIdempotencyConflictError';
  }
}

export class CorpXInsufficientFundsError extends CorpXError {
  constructor(message: string, corpCode?: string, httpStatus?: number, bodySnippet?: string) {
    super(message, corpCode, httpStatus, bodySnippet);
    this.name = 'CorpXInsufficientFundsError';
  }
}

export class CorpXInvalidRequestError extends CorpXError {
  constructor(message: string, corpCode?: string, httpStatus?: number, bodySnippet?: string) {
    super(message, corpCode, httpStatus, bodySnippet);
    this.name = 'CorpXInvalidRequestError';
  }
}

export class CorpXProviderUnavailableError extends CorpXError {
  constructor(message: string, corpCode?: string, httpStatus?: number, bodySnippet?: string) {
    super(message, corpCode, httpStatus, bodySnippet);
    this.name = 'CorpXProviderUnavailableError';
  }
}

export class CorpXTransactionNotFoundError extends CorpXError {
  constructor(
    message: string,
    public readonly lookupId: string,
    corpCode?: string,
    httpStatus?: number,
    bodySnippet?: string,
  ) {
    super(message, corpCode, httpStatus, bodySnippet);
    this.name = 'CorpXTransactionNotFoundError';
  }
}

/** Maps non-specific HTTP failures (used like Go's handleStatusError). */
export function throwStatusError(context: string, statusCode: number, body: string): never {
  const parsed = parseCorpXErrorJson(body);
  const code = parsed.errorCode ?? parsed.code;
  const msg = parsed.message?.trim() || body.trim().slice(0, 500) || `HTTP ${statusCode}`;

  if (statusCode === 429) {
    throw new CorpXProviderUnavailableError(
      `${context}: rate limited — ${msg}`,
      code,
      statusCode,
      body.slice(0, 500),
    );
  }

  if (statusCode >= 500) {
    throw new CorpXProviderUnavailableError(
      `${context}: upstream error — ${msg}`,
      code,
      statusCode,
      body.slice(0, 500),
    );
  }

  if (statusCode === 401 || statusCode === 403) {
    throw new CorpXProviderUnavailableError(
      `${context}: authentication failed — ${msg}`,
      code,
      statusCode,
      body.slice(0, 500),
    );
  }

  throw new CorpXError(`${context}: HTTP ${statusCode} — ${msg}`, code, statusCode, body.slice(0, 500));
}

/**
 * Mirrors Go `handleStatusError` (adapter.go) — stricter mapping than {@link throwStatusError} for balance/history.
 */
export function throwAdapterStatusError(operation: string, statusCode: number, body: string): never {
  const parsed = parseCorpXErrorJson(body);
  const msg = parsed.message?.trim() || body.trim().slice(0, 400) || '';
  const code = parsed.errorCode ?? parsed.code;
  const fieldHint = parsed.field?.trim();

  switch (statusCode) {
    case 404:
      throw new CorpXInvalidRequestError(
        'account not found',
        'account_not_found',
        404,
        body.slice(0, 500),
      );
    case 400: {
      const detail = [fieldHint, msg].filter(Boolean).join(': ') || 'Bad request';
      throw new CorpXInvalidRequestError(detail, code, 400, body.slice(0, 500));
    }
    case 401:
    case 403:
      throw new CorpXProviderUnavailableError(
        'corpx: authentication failed',
        code,
        statusCode,
        body.slice(0, 500),
      );
    case 429:
      throw new CorpXProviderUnavailableError(
        'corpx: rate limited',
        code,
        429,
        body.slice(0, 500),
      );
    case 503:
      throw new CorpXProviderUnavailableError(
        'corpx: service unavailable',
        code,
        503,
        body.slice(0, 500),
      );
    default:
      throw new CorpXError(
        `${operation} failed: status ${statusCode}${msg ? `, message: ${msg}` : ''}`,
        code,
        statusCode,
        body.slice(0, 500),
      );
  }
}

export const CORPX_ERROR_INSUFFICIENT_BALANCE = 'insufficient_balance';
