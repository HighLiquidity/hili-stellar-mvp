import { describe, expect, it } from 'vitest';

import {
  buildOnrampPixCorrelationId,
  buildOnrampPixIdempotencyKey,
  isOnrampQuoteExpired,
} from './lock';
import { resolveOnrampPixExpiresAt } from './ttl';

describe('onramp lock helpers', () => {
  it('builds stable CorpX identifiers for the order lock', () => {
    expect(buildOnrampPixCorrelationId('order-123')).toBe('onramp:order-123:pix');
    expect(buildOnrampPixIdempotencyKey('order-123')).toBe('onramp-lock:order-123');
  });

  it('detects when a quote has expired', () => {
    expect(isOnrampQuoteExpired('2026-05-26T15:00:00.000Z', new Date('2026-05-26T15:00:01.000Z'))).toBe(
      true,
    );
    expect(isOnrampQuoteExpired('2026-05-26T15:00:00.000Z', new Date('2026-05-26T14:59:59.000Z'))).toBe(
      false,
    );
  });

  it('never extends PIX validity beyond quote expiry', () => {
    const now = new Date('2026-05-26T14:58:00.000Z');
    const pixExpiresAt = resolveOnrampPixExpiresAt('2026-05-26T15:00:00.000Z', now);

    expect(pixExpiresAt.getTime()).toBeLessThanOrEqual(Date.parse('2026-05-26T15:00:00.000Z'));
    expect(pixExpiresAt.getTime()).toBeGreaterThan(now.getTime());
  });
});
