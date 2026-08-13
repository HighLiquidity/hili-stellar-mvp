import '@/lib/server/only';

/** Base error for failures inside the server-side Binance module. */
export class BinanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BinanceError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when Binance env vars are missing or invalid. */
export class BinanceConfigError extends BinanceError {
  constructor(message: string) {
    super(message);
    this.name = 'BinanceConfigError';
  }
}

/** Thrown when internal callers pass invalid parameters to Binance services. */
export class BinanceValidationError extends BinanceError {
  constructor(message: string) {
    super(message);
    this.name = 'BinanceValidationError';
  }
}

/** Thrown when a Binance HTTP request fails or returns an invalid payload. */
export class BinanceRequestError extends BinanceError {
  readonly status: number;
  readonly code: string | number | null;
  readonly details: unknown;

  constructor(status: number, code: string | number | null, message: string, details: unknown = null) {
    super(message);
    this.name = 'BinanceRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Binance REST code for invalid API-key, IP, or permissions (`-2015`). */
export const BINANCE_IP_RESTRICTION_CODE = -2015;

/**
 * True only for a signed-request rejection caused by API-key / IP / permissions.
 * Timeouts, network errors, and other Binance codes must not match — retrying those
 * can duplicate orders or fiat deposits.
 */
export function isBinanceIpRestrictionError(error: unknown): error is BinanceRequestError {
  if (!(error instanceof BinanceRequestError) || error.code === null) {
    return false;
  }

  const numericCode =
    typeof error.code === 'number'
      ? error.code
      : /^-?\d+$/.test(error.code.trim())
        ? Number(error.code.trim())
        : Number.NaN;

  return numericCode === BINANCE_IP_RESTRICTION_CODE;
}

/** Reserved for endpoints that still need additional implementation details. */
export class BinanceNotImplementedError extends BinanceError {
  constructor(message = 'Binance integration stub is not implemented yet') {
    super(message);
    this.name = 'BinanceNotImplementedError';
  }
}
