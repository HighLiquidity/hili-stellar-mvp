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
