import { describe, expect, it } from 'vitest';

import { resolveOnrampUsdcDeliveryMemo } from './usdc-delivery-memo';

describe('resolveOnrampUsdcDeliveryMemo', () => {
  it('uses user memo when present', () => {
    expect(
      resolveOnrampUsdcDeliveryMemo({
        id: 'order-1',
        destination_memo: 'invoice-42',
      }),
    ).toBe('invoice-42');
  });

  it('falls back to correlation memo when user memo is empty', () => {
    expect(
      resolveOnrampUsdcDeliveryMemo({
        id: 'order-1',
        destination_memo: null,
      }),
    ).toBe('client-usdc:order-1');
  });
});
