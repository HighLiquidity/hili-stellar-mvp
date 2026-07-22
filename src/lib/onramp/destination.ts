import type { RampPayoutMethod } from '@/lib/ramp/types';

/** Classic Stellar account (G…) or Soroban contract / smart wallet (C…). */
export const STELLAR_DESTINATION_PATTERN = /^[GC][A-Z2-7]{55}$/;

export function isSorobanDestinationAddress(address: string): boolean {
  const normalized = address.trim().toUpperCase();
  return normalized.startsWith('C') && STELLAR_DESTINATION_PATTERN.test(normalized);
}

export function resolveOnrampPayoutMethod(destinationAddress: string): RampPayoutMethod {
  return isSorobanDestinationAddress(destinationAddress) ? 'soroban' : 'classic';
}
