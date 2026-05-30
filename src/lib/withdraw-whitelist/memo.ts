import { truncateUtf8Bytes } from '@/lib/ramp/memo';

/** Stellar text memo limit (UTF-8 bytes) for on-chain payouts. */
export const STELLAR_WHITELIST_MEMO_MAX_BYTES = 28;

export function normalizeWithdrawWhitelistMemo(memo?: string | null): string | null {
  if (memo == null) {
    return null;
  }

  const normalized = memo.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length > 128) {
    throw new Error('Memo must be 128 characters or less.');
  }

  return truncateUtf8Bytes(normalized, STELLAR_WHITELIST_MEMO_MAX_BYTES);
}
