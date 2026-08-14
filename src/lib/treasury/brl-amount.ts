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

/** Binance BRL fiat bank-transfer withdraw fee (PF). Override with BINANCE_BRL_WITHDRAW_FEE_BRL. */
export const DEFAULT_BINANCE_BRL_WITHDRAW_FEE_BRL = '3.5';

export function readBinanceBrlWithdrawFeeFromEnv(): string {
  const fromEnv =
    typeof process !== 'undefined' ? process.env.BINANCE_BRL_WITHDRAW_FEE_BRL?.trim() : undefined;
  if (!fromEnv) {
    return DEFAULT_BINANCE_BRL_WITHDRAW_FEE_BRL;
  }
  return normalizeBrlAmount(fromEnv, 'BINANCE_BRL_WITHDRAW_FEE_BRL');
}

function parseBrlToCents(value: string, fieldName: string): bigint {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error(`${fieldName} must be a BRL amount with up to 2 decimals.`);
  }
  const [whole, fraction = ''] = normalized.split('.');
  const cents = `${fraction}00`.slice(0, 2);
  return BigInt(whole) * BigInt(100) + BigInt(cents);
}

function formatBrlFromCents(cents: bigint): string {
  if (cents < BigInt(0)) {
    throw new Error('BRL amount cannot be negative.');
  }
  const whole = cents / BigInt(100);
  const fraction = (cents % BigInt(100)).toString().padStart(2, '0').replace(/0+$/, '');
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
}

export type BinanceBrlWithdrawProjection = {
  withdrawFeeBrl: string;
  amountNetBrl: string;
  binanceBrlAfter: string;
  corpxBrlAfter: string;
};

/**
 * Binance debit = requested amount. The 3.50 BRL fee is taken from that amount,
 * so CorpX is credited amount − fee. After balances are estimates.
 */
export function projectBinanceBrlWithdrawBalances(input: {
  amountBrl: string;
  binanceBrlFree: string;
  corpxAvailable: string;
  feeBrl?: string;
}): BinanceBrlWithdrawProjection {
  const fee = normalizeBrlAmount(
    input.feeBrl ?? DEFAULT_BINANCE_BRL_WITHDRAW_FEE_BRL,
    'Binance BRL withdraw fee',
  );
  const amount = normalizeBrlAmount(input.amountBrl, 'amount');
  const free = normalizeBrlAmount(
    floorBrlWalletAmount(input.binanceBrlFree, 'Binance BRL free balance'),
    'Binance BRL free balance',
  );

  const amountCents = parseBrlToCents(amount, 'amount');
  const feeCents = parseBrlToCents(fee, 'Binance BRL withdraw fee');
  if (amountCents <= feeCents) {
    throw new Error(`amount must be greater than the Binance BRL withdraw fee (${fee}).`);
  }

  const freeCents = parseBrlToCents(free, 'Binance BRL free balance');
  const afterBinanceCents = freeCents - amountCents;
  if (afterBinanceCents < BigInt(0)) {
    throw new Error(`amount (${amount}) exceeds Binance BRL free balance (${free}).`);
  }

  const netCents = amountCents - feeCents;
  let corpxBrlAfter = 'unavailable';
  const currentCorpx = input.corpxAvailable.trim();
  if (currentCorpx && currentCorpx !== 'unavailable') {
    const corpxNow = floorBrlWalletAmount(currentCorpx, 'CorpX available balance');
    corpxBrlAfter = formatBrlFromCents(parseBrlToCents(corpxNow, 'CorpX available balance') + netCents);
  }

  return {
    withdrawFeeBrl: fee,
    amountNetBrl: formatBrlFromCents(netCents),
    binanceBrlAfter: formatBrlFromCents(afterBinanceCents),
    corpxBrlAfter,
  };
}

/**
 * CorpX debit = requested amount; Binance BRL free increases by the same amount
 * (Binance PIX deposit has no platform fee). After balances are estimates.
 */
export function projectCorpxBrlToBinanceBalances(input: {
  amountBrl: string;
  corpxAvailable: string;
  binanceBrlFree: string;
}): { corpxBrlAfter: string; binanceBrlAfter: string } {
  const amount = normalizeBrlAmount(input.amountBrl, 'amount');
  const corpx = normalizeBrlAmount(
    floorBrlWalletAmount(input.corpxAvailable, 'CorpX available balance'),
    'CorpX available balance',
  );
  const amountCents = parseBrlToCents(amount, 'amount');
  const corpxCents = parseBrlToCents(corpx, 'CorpX available balance');
  if (corpxCents < amountCents) {
    throw new Error(`amount (${amount}) exceeds CorpX available balance (${corpx}).`);
  }

  const freeRaw = input.binanceBrlFree.trim();
  let binanceBrlAfter = 'unavailable';
  if (freeRaw && freeRaw !== 'unavailable') {
    const freeNow = floorBrlWalletAmount(freeRaw, 'Binance BRL free balance');
    binanceBrlAfter = formatBrlFromCents(
      parseBrlToCents(freeNow, 'Binance BRL free balance') + amountCents,
    );
  }

  return {
    corpxBrlAfter: formatBrlFromCents(corpxCents - amountCents),
    binanceBrlAfter,
  };
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
