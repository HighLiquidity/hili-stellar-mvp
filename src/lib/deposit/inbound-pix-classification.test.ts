import { describe, expect, it } from 'vitest';

import { classifyInboundPixSettlement } from './inbound-pix-classification';

describe('classifyInboundPixSettlement', () => {
  it('treats a paid charge without an order as already settled', () => {
    expect(
      classifyInboundPixSettlement({
        onrampOrder: null,
        charge: { status: 'paid' },
      }),
    ).toBe('already_settled');
  });

  it('treats a paid charge with an order already in pix_received as already settled', () => {
    expect(
      classifyInboundPixSettlement({
        onrampOrder: { status: 'pix_received' },
        charge: { status: 'paid' },
      }),
    ).toBe('already_settled');
  });

  it('routes a locked on-ramp order even when the charge is not pending', () => {
    expect(
      classifyInboundPixSettlement({
        onrampOrder: { status: 'awaiting_pix' },
        charge: null,
      }),
    ).toBe('onramp');
  });

  it('keeps awaiting_pix + paid charge on the on-ramp path (retry after charge upsert)', () => {
    expect(
      classifyInboundPixSettlement({
        onrampOrder: { status: 'awaiting_pix' },
        charge: { status: 'paid' },
      }),
    ).toBe('onramp');
  });

  it('credits legacy deposit only when a pending charge exists and there is no order', () => {
    expect(
      classifyInboundPixSettlement({
        onrampOrder: null,
        charge: { status: 'pending' },
      }),
    ).toBe('legacy_deposit');
  });

  it('rejects unmatched inbound PIX with no charge and no order', () => {
    expect(
      classifyInboundPixSettlement({
        onrampOrder: null,
        charge: null,
      }),
    ).toBe('unmatched');
  });

  it('rejects a failed charge without an order (do not credit BRH)', () => {
    expect(
      classifyInboundPixSettlement({
        onrampOrder: null,
        charge: { status: 'failed' },
      }),
    ).toBe('unmatched');
  });
});
