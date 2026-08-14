/**
 * Resolves BRL transfer amount: explicit request or full CorpX available balance.
 * Amounts use up to 2 decimal places (BRL).
 */
export function resolveTreasuryBrlAmount(input: {
  requestedAmountBrl?: string | null;
  corpxAvailable: string;
}): string {
  return resolveTreasuryBrlAgainstBalance({
    requestedAmountBrl: input.requestedAmountBrl,
    available: input.corpxAvailable,
    availableLabel: 'CorpX available balance',
  });
}

/**
 * Resolves BRL withdraw amount against Binance free BRL.
 */
export function resolveTreasuryBinanceBrlWithdrawAmount(input: {
  requestedAmountBrl?: string | null;
  binanceBrlFree: string;
}): string {
  return resolveTreasuryBrlAgainstBalance({
    requestedAmountBrl: input.requestedAmountBrl,
    available: input.binanceBrlFree,
    availableLabel: 'Binance BRL free balance',
  });
}

function resolveTreasuryBrlAgainstBalance(input: {
  requestedAmountBrl?: string | null;
  available: string;
  availableLabel: string;
}): string {
  const freeNormalized = normalizeBrlAmount(
    floorBrlWalletAmount(input.available, input.availableLabel),
    input.availableLabel,
  );
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
      `amount (${amount}) exceeds ${input.availableLabel} (${freeNormalized}).`,
    );
  }
  if (amountNum < 1) {
    throw new Error('amount must be at least 1 BRL.');
  }
  return amount;
}

/**
 * Wallet balances (Binance spot `free`, CorpX available) often arrive with extra
 * trailing zeros (Binance uses 8 decimals). Truncate toward zero to 2 places so
 * we never treat dust as spendable BRL. User-entered amounts stay strict.
 */
export function floorBrlWalletAmount(value: string, fieldName: string): string {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error(`${fieldName} must be a positive BRL amount with up to 2 decimals.`);
  }
  const [whole, fraction = ''] = normalized.split('.');
  const cents = `${fraction}00`.slice(0, 2);
  const trimmedFraction = cents.replace(/0+$/, '');
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
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
