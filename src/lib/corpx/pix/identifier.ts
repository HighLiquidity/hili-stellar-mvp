/** CorpX dynamic/static QR `identifier` field limit (v2). */
export const CORPX_PIX_IDENTIFIER_MAX_LENGTH = 38;

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

/** Stable charge id for on-ramp dynamic QR (stored as `corpx_identifier`). */
export function buildOnrampPixCorrelationId(orderId: string): string {
  const compact = orderId.replace(/-/g, '').toLowerCase();
  return normalizeCorpXPixIdentifier(`o${compact}`);
}

/** Idempotency key for on-ramp PIX lock (same order → same key). */
export function buildOnrampPixIdempotencyKey(orderId: string): string {
  const compact = orderId.replace(/-/g, '').toLowerCase();
  return normalizeCorpXPixIdentifier(`ol${compact}`);
}
