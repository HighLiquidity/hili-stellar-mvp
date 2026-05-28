import { describe, expect, it } from 'vitest';

import {
  CORPX_PIX_IDENTIFIER_MAX_LENGTH,
  buildOnrampPixCorrelationId,
  buildOnrampPixIdempotencyKey,
  normalizeCorpXPixIdentifier,
} from './identifier';

describe('CorpX PIX identifier', () => {
  const uuid = '18777d61-4611-4480-812f-dbcb5be75b07';
  const uuidCompact = '18777d6146114480812fdbcb5be75b07';

  it('keeps identifiers within CorpX max length', () => {
    expect(buildOnrampPixCorrelationId(uuid).length).toBeLessThanOrEqual(CORPX_PIX_IDENTIFIER_MAX_LENGTH);
    expect(buildOnrampPixIdempotencyKey(uuid).length).toBeLessThanOrEqual(CORPX_PIX_IDENTIFIER_MAX_LENGTH);
    expect(CORPX_PIX_IDENTIFIER_MAX_LENGTH).toBe(32);
  });

  it('uses compact uuid without prefix when prefix would exceed limit', () => {
    expect(buildOnrampPixCorrelationId(uuid)).toBe(uuidCompact);
    expect(buildOnrampPixIdempotencyKey(uuid)).toBe(`l${uuidCompact.slice(0, 31)}`);
  });

  it('uses compact on-ramp prefixes for short order ids', () => {
    expect(buildOnrampPixCorrelationId('order-123')).toBe('oorder123');
    expect(buildOnrampPixIdempotencyKey('order-123')).toBe('olorder123');
  });

  it('normalizes long values by removing hyphens', () => {
    const legacy = `onramp:${uuid}:pix`;
    expect(legacy.length).toBeGreaterThan(CORPX_PIX_IDENTIFIER_MAX_LENGTH);
    const normalized = normalizeCorpXPixIdentifier(legacy);
    expect(normalized.length).toBeLessThanOrEqual(CORPX_PIX_IDENTIFIER_MAX_LENGTH);
    expect(normalized).not.toContain('-');
  });
});
