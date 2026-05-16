import { CorpXInvalidRequestError } from '../errors';

/**
 * Validates a BRL decimal string (>= 0, max 2 fractional digits) and returns a JSON-safe number
 * rounded to cents (aligns with avoiding float drift for typical CorpX amounts).
 */
export function brlStringToJsonNumber(amount: string): number {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new CorpXInvalidRequestError(`Invalid BRL amount (expect up to 2 decimals): ${amount}`);
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) {
    throw new CorpXInvalidRequestError(`Invalid BRL amount: ${amount}`);
  }
  return Math.round(n * 100) / 100;
}
