import type { LedgerTransaction } from './types';

export function sumLedgerVolumes(transactions: LedgerTransaction[]): {
  incomingBrl: number;
  outgoingBrl: number;
} {
  let incomingBrl = 0;
  let outgoingBrl = 0;

  for (const tx of transactions) {
    const n = Number(tx.amountBrl.replace(',', '.'));
    if (!Number.isFinite(n)) continue;
    if (tx.type === 'deposit') incomingBrl += n;
    else outgoingBrl += n;
  }

  return { incomingBrl, outgoingBrl };
}

function parseUsdcFromDetail(detail: string | null): number | null {
  if (!detail?.trim()) return null;
  const match = detail.trim().match(/^([\d.,]+)\s+USDC$/i);
  if (!match?.[1]) return null;
  const n = Number(match[1].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** USDC totals from on/off-ramp statement lines (fiat leg completed). */
export function sumUsdcVolumes(transactions: LedgerTransaction[]): {
  usdcReceived: number;
  usdcSent: number;
} {
  let usdcReceived = 0;
  let usdcSent = 0;

  for (const tx of transactions) {
    const amount = parseUsdcFromDetail(tx.detail);
    if (amount == null) continue;
    if (tx.kind === 'onramp') usdcReceived += amount;
    else if (tx.kind === 'offramp') usdcSent += amount;
  }

  return { usdcReceived, usdcSent };
}
