export type InboundPixChargeStatus = 'pending' | 'paid' | 'failed';

export type InboundPixSettlementClass =
  | 'already_settled'
  | 'onramp'
  | 'legacy_deposit'
  | 'unmatched';

/**
 * PIX inbound must match a product-issued QR (pending charge) or locked on-ramp order.
 * Unmatched credits (treasury Binance→CorpX, PIX avulso) must not mint or credit BRH.
 */
export function classifyInboundPixSettlement(input: {
  onrampOrder: { status: string } | null;
  charge: { status: InboundPixChargeStatus } | null;
}): InboundPixSettlementClass {
  const order = input.onrampOrder;
  const charge = input.charge;

  if (charge?.status === 'paid' && (!order || order.status === 'pix_received')) {
    return 'already_settled';
  }

  if (order) {
    return 'onramp';
  }

  if (charge?.status === 'pending') {
    return 'legacy_deposit';
  }

  return 'unmatched';
}
