/**
 * Formats a BRL amount for the Ramp API (positive decimal string, ≤7 fractional digits).
 */
export function formatRampAmountFromBrl(brlAmount: string): string {
  const normalized = brlAmount.trim().replace(',', '.');
  if (!normalized) {
    throw new Error('amount is empty');
  }

  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('amount must be positive');
  }

  const fixed = n.toFixed(7);
  const trimmed = fixed.replace(/\.?0+$/, '');
  if (!trimmed.includes('.')) {
    return `${trimmed}.0`;
  }
  return trimmed;
}

export function buildOnrampExternalId(providerTxId: string | undefined, dedupeKey: string): string {
  const id = providerTxId?.trim() || dedupeKey.trim();
  return `corpx-onramp:${id}`.slice(0, 200);
}
