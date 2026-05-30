import type { WithdrawWhitelistNetwork } from './types';

/** Stellar public keys are normalized to uppercase for consistent whitelist matching. */
export function normalizeWithdrawWhitelistAddress(address: string): string {
  return address.trim().toUpperCase();
}

/** Network used for on-ramp USDC delivery whitelist checks and wallet listing. */
export function getOnrampWithdrawNetwork(): WithdrawWhitelistNetwork {
  return process.env.ONRAMP_WITHDRAW_NETWORK === 'STELLAR_PUBLIC' ? 'STELLAR_PUBLIC' : 'STELLAR_TESTNET';
}
