import { createHmac, timingSafeEqual } from 'node:crypto';

/** Verifies Ramp callback `X-Signature` (hex HMAC-SHA256 of raw body). */
export function verifyRampCallbackSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader?.trim() || !secret) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signatureHeader.trim(), 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
