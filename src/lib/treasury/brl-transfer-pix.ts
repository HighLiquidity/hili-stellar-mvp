import type { CashOutTransactionStatus, CorpXPIXKeyType } from '@/lib/corpx/pix/types';
import type { PIXCashOutResponse } from '@/lib/corpx/pix/types';
import { parsePixEmv } from '@/lib/pix/emv-parser';

import {
  extractPixEmvFromUnknown,
  extractPixKeyFromUnknown,
  summarizeFiatOrderDetail,
} from './pix-emv-extract';

export const BINANCE_FIAT_PIX_POLL_MS = 2000;
/** Binance often stays on ORDER_INITIAL with empty ext before exposing ext.qrCode. */
export const BINANCE_FIAT_PIX_POLL_MAX_MS = 60_000;
export const BINANCE_FIAT_SETTLEMENT_POLL_MS = 2000;
export const BINANCE_FIAT_SETTLEMENT_POLL_MAX_MS = 45_000;

const INITIAL_ORDER_STATUSES = new Set([
  'ORDER_INITIAL',
  'INITIAL',
  'PROCESSING',
  'PENDING',
  '',
]);

const FAILED_ORDER_STATUSES = new Set([
  'ORDER_FAILED',
  'FAILED',
  'CANCELLED',
  'CANCELED',
  'EXPIRED',
  'ORDER_EXPIRED',
  'REJECTED',
]);

const PAID_ORDER_STATUSES = new Set([
  'SUCCESS',
  'SUCCEEDED',
  'COMPLETED',
  'ORDER_SUCCESS',
  'ORDER_COMPLETED',
  'PAID',
  'FINISHED',
]);

export function readFiatOrderStatus(detail: unknown): string {
  if (!detail || typeof detail !== 'object') return '';
  const record = detail as Record<string, unknown>;
  for (const key of ['orderStatus', 'status']) {
    if (typeof record[key] === 'string') {
      return record[key].trim().toUpperCase();
    }
  }
  return '';
}

export function isBinanceFiatOrderFailed(detail: unknown): boolean {
  const status = readFiatOrderStatus(detail);
  if (FAILED_ORDER_STATUSES.has(status)) return true;
  if (!detail || typeof detail !== 'object') return false;
  const record = detail as Record<string, unknown>;
  const errorCode = typeof record.errorCode === 'string' ? record.errorCode.trim() : '';
  return Boolean(errorCode && errorCode !== '0' && errorCode !== '000000');
}

export function isBinanceFiatOrderPaid(detail: unknown): boolean {
  return PAID_ORDER_STATUSES.has(readFiatOrderStatus(detail));
}

export function isBinanceFiatOrderInitializing(detail: unknown): boolean {
  const status = readFiatOrderStatus(detail);
  if (PAID_ORDER_STATUSES.has(status) || FAILED_ORDER_STATUSES.has(status)) return false;
  if (status === 'ORDER_NEED_ADDITIONAL_ACTION') return false;
  return INITIAL_ORDER_STATUSES.has(status) || status.length === 0;
}

export type ResolvedPixPayment =
  | { mode: 'emv'; emv: string }
  | { mode: 'key'; key: string; keyType: CorpXPIXKeyType };

export function resolvePixPaymentFromOrderDetail(detail: unknown): ResolvedPixPayment | null {
  const emv = extractPixEmvFromUnknown(detail);
  if (emv) return { mode: 'emv', emv };
  const pixKey = extractPixKeyFromUnknown(detail);
  if (pixKey) return { mode: 'key', key: pixKey, keyType: 'EVP' };
  return null;
}

/** When EMV already embeds tag 54, omit amount so CorpX does not reject a conflicting body. */
export function amountForEmvPayout(emv: string, plannedAmount: string): string | undefined {
  const parsed = parsePixEmv(emv);
  if (parsed.ok && parsed.data.amountBrl) {
    return undefined;
  }
  return plannedAmount;
}

/**
 * Ensures CorpX acknowledged the PIX out with a real provider id.
 * Empty 2xx bodies previously caused false "completed" treasury runs.
 */
export function assertCorpXPixOutAccepted(payout: PIXCashOutResponse): void {
  if (payout.status === 'failed') {
    throw new Error(
      `CorpX PIX out failed (status=${payout.status}` +
        (payout.providerTxId ? ` providerTxId=${payout.providerTxId}` : '') +
        (payout.e2eId ? ` e2e=${payout.e2eId}` : '') +
        ')',
    );
  }

  const providerTxId = payout.providerTxId?.trim() ?? '';
  const e2eId = payout.e2eId?.trim() ?? '';
  if (!providerTxId && !e2eId) {
    throw new Error(
      `CorpX PIX out response missing transactionId/endToEndId (status=${payout.status}). ` +
        'Payment was not confirmed — check CorpX ledger before retrying.',
    );
  }
}

export function formatMissingPixError(orderId: string, detail: unknown): string {
  return (
    `Binance fiat deposit created (orderId=${orderId}) but no PIX EMV/key was found after polling. ` +
    `${summarizeFiatOrderDetail(detail)}. ` +
    `Inspect GET /api/binance/fiat/order?orderNo=${orderId}, set BINANCE_BRL_DEPOSIT_PIX_KEY, or pay the order manually in Binance.`
  );
}

export type SettlementProbeResult = {
  detail: unknown;
  paid: boolean;
  status: string;
};

export function describeSettlementProbe(result: SettlementProbeResult): string {
  if (result.paid) return `binance_order_paid status=${result.status || 'unknown'}`;
  return `binance_settlement_pending status=${result.status || 'unknown'}`;
}

export function cashOutStatusLabel(status: CashOutTransactionStatus): string {
  return status;
}
