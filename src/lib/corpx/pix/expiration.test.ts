import { describe, expect, it } from 'vitest';

import {
  CORPX_PIX_MAX_EXPIRATION_MS,
  clampCorpXPixExpirationDate,
} from './expiration';

describe('clampCorpXPixExpirationDate', () => {
  it('keeps near-term expirations unchanged', () => {
    const now = new Date('2026-05-26T12:00:00.000Z');
    const expiresAt = new Date('2026-05-26T12:05:00.000Z');

    expect(clampCorpXPixExpirationDate(expiresAt, now).toISOString()).toBe(expiresAt.toISOString());
  });

  it('caps expirations beyond CorpX one-day limit', () => {
    const now = new Date('2026-05-26T12:00:00.000Z');
    const tooFar = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const clamped = clampCorpXPixExpirationDate(tooFar, now);
    expect(clamped.getTime()).toBe(now.getTime() + CORPX_PIX_MAX_EXPIRATION_MS);
  });
});
