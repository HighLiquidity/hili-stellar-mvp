import '@/lib/server/only';

import { parseMaxDepositBrl } from '@/lib/admin-test-settings/deposit-limits';

export function parseSpreadBpsOverride(value: string | undefined): number | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10_000) {
    throw new Error('spreadBpsOverride must be an integer between 0 and 10000.');
  }

  return parsed;
}

export function parseMaxAmountBrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const max = parseMaxDepositBrl(trimmed);
  if (max == null || max <= 0) {
    throw new Error('maxAmountBrl must be a positive BRL amount with up to 2 decimals.');
  }

  return trimmed;
}
