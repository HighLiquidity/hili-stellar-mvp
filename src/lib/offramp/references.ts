import '@/lib/server/only';

const OFFRAMP_USDC_DEPOSIT_PREFIX = 'offramp-usdc-deposit:';
const OFFRAMP_PIX_PAYOUT_IDEMPOTENCY_PREFIX = 'offramp-pix-payout:';
const OFFRAMP_PIX_PAYOUT_REFERENCE_PREFIX = 'offramp-pix:';
const OFFRAMP_BRH_ISSUE_PREFIX = 'offramp-brh-issue:';
const OFFRAMP_BRH_REDEMPTION_PREFIX = 'offramp-brh-redemption:';

export function buildOfframpUsdcDepositExternalId(orderId: string): string {
  return `${OFFRAMP_USDC_DEPOSIT_PREFIX}${orderId.trim()}`.slice(0, 200);
}

export function isOfframpUsdcDepositExternalId(externalId: string): boolean {
  return externalId.startsWith(OFFRAMP_USDC_DEPOSIT_PREFIX);
}

export function buildOfframpPixPayoutIdempotencyKey(orderId: string): string {
  return `${OFFRAMP_PIX_PAYOUT_IDEMPOTENCY_PREFIX}${orderId.trim()}`.slice(0, 200);
}

export function buildOfframpPixPayoutReference(orderId: string): string {
  return `${OFFRAMP_PIX_PAYOUT_REFERENCE_PREFIX}${orderId.trim()}`.slice(0, 60);
}

/**
 * Stable external id used to reconcile the custodial BRH burn/record step for off-ramp.
 * (Does not need to match the legacy `corpx-offramp:*` ids; it's tracked per-order.)
 */
export function buildOfframpBrhIssueExternalId(orderId: string): string {
  return `${OFFRAMP_BRH_ISSUE_PREFIX}${orderId.trim()}`.slice(0, 200);
}

export function isOfframpBrhIssueExternalId(externalId: string): boolean {
  return externalId.startsWith(OFFRAMP_BRH_ISSUE_PREFIX);
}

export function buildOfframpBrhRedemptionExternalId(orderId: string): string {
  return `${OFFRAMP_BRH_REDEMPTION_PREFIX}${orderId.trim()}`.slice(0, 200);
}

export function isOfframpBrhRedemptionExternalId(externalId: string): boolean {
  return externalId.startsWith(OFFRAMP_BRH_REDEMPTION_PREFIX);
}

export { buildOfframpBinanceClientOrderId } from '@/lib/server/binance/client-order-id';
