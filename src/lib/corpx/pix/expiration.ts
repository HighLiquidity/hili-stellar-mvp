/** CorpX partner cap for dynamic QR `expirationDate` (1 day; small margin for clock skew). */
export const CORPX_PIX_MAX_EXPIRATION_MS = 24 * 60 * 60 * 1000 - 60_000;

export const CORPX_PIX_MAX_EXPIRATION_SECONDS = Math.floor(CORPX_PIX_MAX_EXPIRATION_MS / 1000);

/**
 * Ensures PIX QR expiration is not beyond CorpX's configured maximum from `now`.
 */
export function clampCorpXPixExpirationDate(expiresAt: Date, now = new Date()): Date {
  const maxMs = now.getTime() + CORPX_PIX_MAX_EXPIRATION_MS;
  const targetMs = expiresAt.getTime();

  if (!Number.isFinite(targetMs)) {
    return new Date(maxMs);
  }

  return new Date(Math.min(targetMs, maxMs));
}
