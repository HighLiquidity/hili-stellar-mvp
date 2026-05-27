import '@/lib/server/only';

function normalizeOrderId(orderId: string): string {
  const normalized = orderId.trim();
  if (!normalized) {
    throw new Error('onramp order id is required');
  }

  return normalized;
}

export function buildOnrampBrhSaleExternalId(orderId: string): string {
  return `onramp:${normalizeOrderId(orderId)}:brh-sale`;
}

export function buildOnrampUsdcDeliveryExternalId(orderId: string): string {
  return `onramp:${normalizeOrderId(orderId)}:client-usdc`;
}

export function buildOnrampBinanceClientOrderId(orderId: string): string {
  return `onramp:${normalizeOrderId(orderId)}:fx`;
}

export function buildOnrampBrhRedemptionExternalId(orderId: string): string {
  return `onramp:${normalizeOrderId(orderId)}:brh-redemption`;
}

export function buildOnrampBinanceWithdrawOrderId(orderId: string): string {
  return `onramp:${normalizeOrderId(orderId)}:usdc-refill`;
}

export function isOnrampBrhSaleExternalId(externalId: string): boolean {
  return /^onramp:[^:]+:brh-sale$/.test(externalId.trim());
}

export function isOnrampUsdcDeliveryExternalId(externalId: string): boolean {
  return /^onramp:[^:]+:client-usdc$/.test(externalId.trim());
}
