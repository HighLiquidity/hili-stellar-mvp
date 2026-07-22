import type { WithdrawWhitelistNetwork } from './types';
import { isSorobanDestinationAddress, STELLAR_DESTINATION_PATTERN } from '@/lib/onramp/destination';

export class WithdrawWhitelistAddressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WithdrawWhitelistAddressError';
  }
}

/** Stellar public keys / contract ids normalized to uppercase for whitelist matching. */
export function normalizeWithdrawWhitelistAddress(address: string): string {
  const normalized = address.trim().toUpperCase();
  if (!normalized) {
    return normalized;
  }
  if (!STELLAR_DESTINATION_PATTERN.test(normalized)) {
    throw new WithdrawWhitelistAddressError(
      'Address must be a valid Stellar account (G…) or contract (C…) address.',
    );
  }
  return normalized;
}

/** Classic memo only applies to G-address payouts; C (Soroban) destinations ignore memo. */
export function shouldOfferWithdrawWhitelistMemo(address: string): boolean {
  const trimmed = address.trim();
  if (!trimmed) return true;
  return !isSorobanDestinationAddress(trimmed);
}

/** Network used on-ramp USDC delivery whitelist checks and wallet listing. */
export function getOnrampWithdrawNetwork(): WithdrawWhitelistNetwork {
  const configured = process.env.ONRAMP_WITHDRAW_NETWORK?.trim().toUpperCase();
  return configured === 'STELLAR_PUBLIC' ? 'STELLAR_PUBLIC' : 'STELLAR_TESTNET';
}
