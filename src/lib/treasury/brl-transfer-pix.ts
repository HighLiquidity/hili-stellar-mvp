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
/** Combined CorpX lookup + Binance paid probe after PIX submit (replaces two sequential 45s waits). */
export const TREASURY_PIX_ARRIVAL_POLL_MAX_MS = 60_000;

/** BACEN E2E: E + ISPB(8) + yyyyMMddHHmm(12) + 11 alnum = 32 chars. */
export function isBacenPixEndToEndId(value: string | undefined | null): boolean {
  const id = value?.trim().toUpperCase() ?? '';
  return /^E[0-9]{8}[0-9]{12}[A-Z0-9]{11}$/.test(id);
}

export type TreasuryPixOutOutcome =
  | 'settled'
  | 'in_flight'
  | 'awaiting_approval'
  | 'failed'
  | 'not_sent';

/**
 * Binance PAID or CorpX COMPLETED = settled.
 * PROCESSING with a BACEN E2E is in-flight — do not retry.
 * PENDING_APPROVAL means funds have not moved (admin approval or risk desk).
 */
export function classifyTreasuryPixOutOutcome(input: {
  corpxStatus: CashOutTransactionStatus;
  e2eId?: string;
  binancePaid: boolean;
}): TreasuryPixOutOutcome {
  if (input.binancePaid || input.corpxStatus === 'completed') return 'settled';
  if (input.corpxStatus === 'failed') return 'failed';
  if (input.corpxStatus === 'pending_approval') return 'awaiting_approval';
  if (isBacenPixEndToEndId(input.e2eId) || input.corpxStatus === 'requires_reconciliation') {
    return 'in_flight';
  }
  return 'not_sent';
}

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

export function inferPixKeyType(rawPixKey: string): CorpXPIXKeyType {
  const pixKey = rawPixKey.trim();
  const digitsOnly = pixKey.replace(/\D/g, '');

  if (digitsOnly.length === 11) return 'CPF';
  if (digitsOnly.length === 14) return 'CNPJ';
  if (pixKey.includes('@')) return 'EMAIL';
  if (/^\+?\d{10,13}$/.test(pixKey) || /^\d{10,13}$/.test(digitsOnly)) return 'PHONE';
  return 'EVP';
}

export function resolvePixPaymentFromOrderDetail(detail: unknown): ResolvedPixPayment | null {
  const emv = extractPixEmvFromUnknown(detail);
  if (emv) return { mode: 'emv', emv };
  const pixKey = extractPixKeyFromUnknown(detail);
  if (pixKey) return { mode: 'key', key: pixKey, keyType: 'EVP' };
  return null;
}

/** Amount to send on CorpX PIX QR pay. Official examples always include `amount`. */
export function amountForEmvPayout(emv: string, plannedAmount: string): string {
  const parsed = parsePixEmv(emv);
  if (parsed.ok && parsed.data.amountBrl) {
    return parsed.data.amountBrl;
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

/** Submit 2xx is not settlement. Money has not left CorpX until lookup is completed. */
export function assertCorpXPixOutSettled(
  status: CashOutTransactionStatus,
  detail: string,
  e2eId?: string,
): void {
  throwIfTreasuryPixOutUnresolved(
    classifyTreasuryPixOutOutcome({ corpxStatus: status, e2eId, binancePaid: false }),
    detail,
  );
}

export function throwIfTreasuryPixOutUnresolved(
  outcome: TreasuryPixOutOutcome,
  detail: string,
): void {
  if (outcome === 'settled' || outcome === 'in_flight') return;
  if (outcome === 'failed') {
    throw new Error(`CorpX PIX out failed after submit. ${detail}`);
  }
  if (outcome === 'awaiting_approval') {
    throw new Error(
      `CorpX PIX is PENDING_APPROVAL (settlement-bank risk hold). Money has not left CorpX. ` +
        `The CorpX API backoffice has no approve action for this state. ` +
        `Wait up to ~30 minutes for COMPLETED, FAILED, or TIMEOUT. Do not retry. ${detail}`,
    );
  }
  throw new Error(
    `CorpX PIX out did not settle (status=pending). Money may not have left CorpX. ${detail}`,
  );
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
