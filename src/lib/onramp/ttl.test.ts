import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ONRAMP_QUOTE_TTL_SECONDS,
  hasMinimumQuoteTimeToLock,
  resolveOnrampPixExpiresAt,
} from './ttl';

describe('onramp ttl', () => {
  it('caps PIX expiry at quote expiry', () => {
    const now = new Date('2026-05-26T14:50:00.000Z');
    const quoteExpiresAt = '2026-05-26T14:55:00.000Z';

    const pixExpiresAt = resolveOnrampPixExpiresAt(quoteExpiresAt, now);

    expect(pixExpiresAt.toISOString()).toBe('2026-05-26T14:55:00.000Z');
  });

  it('requires a minimum remaining quote window before lock', () => {
    expect(
      hasMinimumQuoteTimeToLock('2026-05-26T15:00:00.000Z', new Date('2026-05-26T14:59:00.000Z')),
    ).toBe(true);
    expect(
      hasMinimumQuoteTimeToLock('2026-05-26T15:00:00.000Z', new Date('2026-05-26T14:59:59.999Z')),
    ).toBe(false);
  });

  it('uses a short default quote TTL for slippage control', () => {
    expect(DEFAULT_ONRAMP_QUOTE_TTL_SECONDS).toBe(5 * 60);
  });
});
