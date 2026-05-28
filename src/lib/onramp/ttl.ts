import '@/lib/server/only';

import {
  CORPX_PIX_MAX_EXPIRATION_SECONDS,
  clampCorpXPixExpirationDate,
} from '@/lib/corpx/pix/expiration';

import { OnrampConfigError } from './errors';

/** Default window to lock a quote and complete PIX payment (aligned). */
export const DEFAULT_ONRAMP_QUOTE_TTL_SECONDS = 5 * 60;

/** Upper bound for PIX charge validity from lock time (capped by quote expiry). */
export const DEFAULT_ONRAMP_PIX_TTL_SECONDS = 5 * 60;

/** Minimum remaining quote time required to accept a lock request. */
export const DEFAULT_ONRAMP_MIN_LOCK_REMAINING_SECONDS = 30;

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  if (!/^\d+$/.test(raw)) {
    throw new OnrampConfigError(`${name} must be a positive integer.`);
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new OnrampConfigError(`${name} must be greater than zero.`);
  }

  return parsed;
}

function capTtlSecondsForCorpXPix(ttlSeconds: number): number {
  return Math.min(ttlSeconds, CORPX_PIX_MAX_EXPIRATION_SECONDS);
}

export function getOnrampQuoteTtlSeconds(): number {
  return capTtlSecondsForCorpXPix(
    readPositiveIntegerEnv('ONRAMP_QUOTE_TTL_SECONDS', DEFAULT_ONRAMP_QUOTE_TTL_SECONDS),
  );
}

export function getOnrampPixTtlSeconds(): number {
  return capTtlSecondsForCorpXPix(
    readPositiveIntegerEnv('ONRAMP_PIX_TTL_SECONDS', DEFAULT_ONRAMP_PIX_TTL_SECONDS),
  );
}

export function getOnrampMinLockRemainingSeconds(): number {
  return readPositiveIntegerEnv(
    'ONRAMP_MIN_LOCK_REMAINING_SECONDS',
    DEFAULT_ONRAMP_MIN_LOCK_REMAINING_SECONDS,
  );
}

export function getQuoteRemainingMs(quoteExpiresAt: string, nowMs = Date.now()): number {
  const quoteExpiresMs = Date.parse(quoteExpiresAt);
  if (!Number.isFinite(quoteExpiresMs)) {
    return 0;
  }

  return Math.max(0, quoteExpiresMs - nowMs);
}

export function hasMinimumQuoteTimeToLock(quoteExpiresAt: string, now = new Date()): boolean {
  const remainingMs = getQuoteRemainingMs(quoteExpiresAt, now.getTime());
  return remainingMs >= getOnrampMinLockRemainingSeconds() * 1000;
}

/**
 * PIX charge expires at the earlier of quote expiry or lock-time + configured PIX TTL.
 * This keeps payment aligned with the quoted rate window.
 */
export function resolveOnrampPixExpiresAt(quoteExpiresAt: string, now = new Date()): Date {
  const quoteExpiresMs = Date.parse(quoteExpiresAt);
  const pixCapMs = now.getTime() + getOnrampPixTtlSeconds() * 1000;

  if (!Number.isFinite(quoteExpiresMs)) {
    return clampCorpXPixExpirationDate(new Date(pixCapMs), now);
  }

  return clampCorpXPixExpirationDate(new Date(Math.min(quoteExpiresMs, pixCapMs)), now);
}
