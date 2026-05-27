import '@/lib/server/only';

import { createHmac } from 'node:crypto';

/** Small HMAC helpers used by signed Binance REST requests. */
export function signBinanceMessage(message: string, secret: string): string {
  return createHmac('sha256', secret).update(message).digest('hex');
}

/** Backward-compatible alias for query-string signing. */
export function signBinanceQuery(payload: string | URLSearchParams, secret: string): string {
  const message = typeof payload === 'string' ? payload : payload.toString();
  return signBinanceMessage(message, secret);
}

export function appendBinanceSignature(params: URLSearchParams, secret: string): URLSearchParams {
  const signedParams = new URLSearchParams(params);
  signedParams.delete('signature');
  signedParams.set('signature', signBinanceQuery(signedParams, secret));
  return signedParams;
}
