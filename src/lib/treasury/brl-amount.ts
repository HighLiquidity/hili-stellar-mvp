/**
 * Resolves BRL transfer amount: explicit request or full CorpX available balance.
 * Amounts use up to 2 decimal places (BRL).
 */
export function resolveTreasuryBrlAmount(input: {
  requestedAmountBrl?: string | null;
  corpxAvailable: string;
}): string {
  const freeNormalized = normalizeBrlAmount(input.corpxAvailable, 'CorpX available balance');
  const rawRequested = input.requestedAmountBrl?.trim();
  const amount = rawRequested
    ? normalizeBrlAmount(rawRequested, 'amount')
    : freeNormalized;

  const freeNum = Number(freeNormalized);
  const amountNum = Number(amount);
  if (!Number.isFinite(freeNum) || !Number.isFinite(amountNum)) {
    throw new Error('Invalid BRL amount for treasury transfer.');
  }
  if (amountNum > freeNum) {
    throw new Error(
      `amount (${amount}) exceeds CorpX available balance (${freeNormalized}).`,
    );
  }
  if (amountNum < 1) {
    throw new Error('amount must be at least 1 BRL.');
  }
  return amount;
}

export function normalizeBrlAmount(value: string, fieldName: string): string {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`${fieldName} must be a positive BRL amount with up to 2 decimals.`);
  }
  const num = Number(normalized);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`${fieldName} must be greater than zero.`);
  }
  // Canonical two-decimal string without trailing junk
  const [whole, fraction = ''] = normalized.split('.');
  const trimmedFraction = fraction.replace(/0+$/, '');
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
}
