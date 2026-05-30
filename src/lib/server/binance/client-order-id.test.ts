import { describe, expect, it } from 'vitest';

import {
  buildBinanceClientOrderId,
  buildOfframpBinanceClientOrderId,
  buildOnrampBinanceClientOrderId,
  buildOnrampBinanceWithdrawOrderId,
  isBinanceClientOrderId,
} from './client-order-id';

describe('Binance client order ids', () => {
  it('rejects legacy colon-separated ids', () => {
    expect(isBinanceClientOrderId('onramp:order-123:fx')).toBe(false);
  });

  it('builds on-ramp trade ids within Binance limits', () => {
    const uuid = '11111111-1111-1111-1111-111111111111';
    const id = buildOnrampBinanceClientOrderId(uuid);

    expect(isBinanceClientOrderId(id)).toBe(true);
    expect(id.length).toBeLessThanOrEqual(36);
    expect(id.startsWith('orf_')).toBe(true);
    expect(id).toBe('orf_11111111111111111111111111111111');
  });

  it('builds on-ramp withdraw ids', () => {
    expect(buildOnrampBinanceWithdrawOrderId('order-123')).toBe('orw_order123');
  });

  it('builds off-ramp trade ids', () => {
    expect(buildOfframpBinanceClientOrderId('order-123')).toBe('off_order123');
  });

  it('truncates very long order ids', () => {
    const longId = 'a'.repeat(80);
    const built = buildBinanceClientOrderId('pfx_', longId);
    expect(built.length).toBe(36);
    expect(isBinanceClientOrderId(built)).toBe(true);
  });
});
