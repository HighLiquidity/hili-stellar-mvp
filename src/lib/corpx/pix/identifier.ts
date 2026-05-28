/** CorpX dynamic/static QR `identifier` field limit (v2). */
export const CORPX_PIX_IDENTIFIER_MAX_LENGTH = 32;

function compactOrderId(orderId: string): string {
  return orderId.replace(/-/g, '').toLowerCase();
}

/**
 * Ensures a value fits CorpX PIX identifier limits (drops hyphens, truncates if needed).
 */
export function normalizeCorpXPixIdentifier(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('CorpX PIX identifier is required');
  }
  if (trimmed.length <= CORPX_PIX_IDENTIFIER_MAX_LENGTH) {
    return trimmed;
  }

  const compact = trimmed.replace(/-/g, '');
  if (compact.length <= CORPX_PIX_IDENTIFIER_MAX_LENGTH) {
    return compact;
  }

  return compact.slice(0, CORPX_PIX_IDENTIFIER_MAX_LENGTH);
}

/**
 * Stable charge id for on-ramp dynamic QR (stored as `corpx_identifier`).
 * UUID orders use the 32-char hex id only; shorter ids keep an `o` prefix when it fits.
 */
export function buildOnrampPixCorrelationId(orderId: string): string {
  const compact = compactOrderId(orderId);
  if (compact.length >= CORPX_PIX_IDENTIFIER_MAX_LENGTH) {
    return compact.slice(0, CORPX_PIX_IDENTIFIER_MAX_LENGTH);
  }

  const withPrefix = `o${compact}`;
  return withPrefix.length <= CORPX_PIX_IDENTIFIER_MAX_LENGTH ? withPrefix : compact;
}

/** Idempotency key for on-ramp PIX lock (same order → same key). */
export function buildOnrampPixIdempotencyKey(orderId: string): string {
  const compact = compactOrderId(orderId);
  const withPrefix = `ol${compact}`;
  if (withPrefix.length <= CORPX_PIX_IDENTIFIER_MAX_LENGTH) {
    return withPrefix;
  }

  if (compact.length >= CORPX_PIX_IDENTIFIER_MAX_LENGTH) {
    return `l${compact.slice(0, CORPX_PIX_IDENTIFIER_MAX_LENGTH - 1)}`;
  }

  return normalizeCorpXPixIdentifier(withPrefix);
}
