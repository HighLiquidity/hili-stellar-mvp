import type { RampOrderFlow } from './list-contracts';

export function rampOrderDetailHref(flow: RampOrderFlow, orderId: string): string {
  const base = flow === 'onramp' ? '/app/onramp' : '/app/offramp';
  return `${base}?orderId=${encodeURIComponent(orderId)}`;
}
