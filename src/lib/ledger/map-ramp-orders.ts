import type { LedgerTransaction } from './types';

export type OnrampStatementRow = {
  id: string;
  amount_brl: string;
  amount_usdc: string;
  pix_received_at: string;
  end_to_end_id: string | null;
  usdc_delivery_tx_hash: string | null;
  destination_address: string;
};

export type OfframpStatementRow = {
  id: string;
  amount_brl: string;
  amount_usdc: string;
  pix_sent_at: string;
  payout_end_to_end_id: string | null;
  payout_beneficiary_name: string | null;
  usdc_received_tx_hash: string | null;
};

export function mapOnrampOrdersToTransactions(rows: OnrampStatementRow[]): LedgerTransaction[] {
  return rows.map((row) => ({
    id: `onramp:${row.id}`,
    kind: 'onramp',
    type: 'deposit',
    amountBrl: row.amount_brl,
    createdAt: row.pix_received_at,
    pixE2eId: row.end_to_end_id?.trim() || null,
    txHash: row.usdc_delivery_tx_hash?.trim() || null,
    beneficiaryName: null,
    detail: row.amount_usdc?.trim() ? `${row.amount_usdc.trim()} USDC` : null,
    orderId: row.id,
    orderFlow: 'onramp',
  }));
}

export function mapOfframpOrdersToTransactions(rows: OfframpStatementRow[]): LedgerTransaction[] {
  return rows.map((row) => ({
    id: `offramp:${row.id}`,
    kind: 'offramp',
    type: 'withdraw',
    amountBrl: row.amount_brl,
    createdAt: row.pix_sent_at,
    pixE2eId: row.payout_end_to_end_id?.trim() || null,
    txHash: row.usdc_received_tx_hash?.trim() || null,
    beneficiaryName: row.payout_beneficiary_name?.trim() || null,
    detail: row.amount_usdc?.trim() ? `${row.amount_usdc.trim()} USDC` : null,
    orderId: row.id,
    orderFlow: 'offramp',
  }));
}

export function sortStatementTransactions(transactions: LedgerTransaction[]): LedgerTransaction[] {
  return [...transactions].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function paginateStatementTransactions(
  transactions: LedgerTransaction[],
  page: number,
  pageSize: number,
): { pageRows: LedgerTransaction[]; total: number } {
  const total = transactions.length;
  const safePage = Math.max(1, page);
  const safeSize = Math.min(Math.max(pageSize, 1), 100);
  const from = (safePage - 1) * safeSize;
  return {
    total,
    pageRows: transactions.slice(from, from + safeSize),
  };
}
