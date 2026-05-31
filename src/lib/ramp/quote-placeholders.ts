/** Stellar null account — persisted on price-only quotes until lock supplies a whitelisted wallet. */
export const ONRAMP_QUOTE_PLACEHOLDER_DESTINATION =
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

/** Persisted on price-only off-ramp quotes until lock supplies a whitelisted PIX key. */
export const OFFRAMP_QUOTE_PLACEHOLDER_PIX_KEY = 'pending-whitelist';

export function isOnrampQuotePlaceholderDestination(address: string): boolean {
  return address.trim().toUpperCase() === ONRAMP_QUOTE_PLACEHOLDER_DESTINATION;
}

export function isOfframpQuotePlaceholderPixKey(pixKey: string): boolean {
  return pixKey.trim() === OFFRAMP_QUOTE_PLACEHOLDER_PIX_KEY;
}
