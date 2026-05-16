import type { WebhookProcessingResult } from './types';
import { loadCorpXWebhookIpAllowlist } from './allowlist';
import {
  isRecord,
  isStrictlyPositiveAmount,
  jsonNumberToAmountString,
  pickString,
  unwrapWebhookPayload,
} from './payload-fields';

export function processCorpXWebhookEvent(eventType: string, payload: unknown): WebhookProcessingResult {
  switch (eventType) {
    case 'pix_in_received':
      return processPIXInReceived(eventType, payload);
    case 'pix_out_completed':
      return processPIXOutCompleted(eventType, payload);
    case 'pix_out_failed':
      return processPIXOutFailed(eventType, payload);
    case 'qr_code_paid':
      return processQRCodePaid(eventType, payload);
    default:
      return {
        eventType,
        status: 'failed',
        errorMessage: `unsupported event type: ${eventType}`,
      };
  }
}

function processPIXInReceived(eventType: string, payload: unknown): WebhookProcessingResult {
  const pix = unwrapWebhookPayload(payload);
  if (!isRecord(pix) || Object.keys(pix).length === 0) {
    return {
      eventType,
      status: 'failed',
      errorMessage: 'failed to parse PIX payment payload',
    };
  }

  const transactionId = pickString(pix, 'transactionId', 'transaction_id') ?? '';
  const txid = pickString(pix, 'txid', 'txId') ?? '';
  const amountStr = jsonNumberToAmountString(pix.amount ?? pix.value ?? pix.paidAmount);

  const chargeTxid = txid || transactionId;
  if (!chargeTxid || !amountStr || !isStrictlyPositiveAmount(amountStr)) {
    return {
      eventType,
      status: 'failed',
      errorMessage: 'invalid PIX payment: missing transaction id / txid or invalid amount',
    };
  }

  return {
    providerTxId: transactionId || txid,
    eventType,
    status: 'completed',
    updatedFields: {
      amount: amountStr,
      txid: chargeTxid,
      currency: pickString(pix, 'currency') ?? jsonNumberToAmountString(pix.currency) ?? '',
      end_to_end_id: pickString(pix, 'endToEndId', 'end_to_end_id') ?? '',
      payer_name: pickString(pix, 'payerName', 'payer_name') ?? '',
      payer_document: pickString(pix, 'payerDocument', 'payer_document') ?? '',
      account_id: pickString(pix, 'accountId', 'account_id') ?? '',
      identifier: pickString(pix, 'identifier') ?? '',
    },
    requiresAction: 'update_balance',
  };
}

function processPIXOutCompleted(eventType: string, payload: unknown): WebhookProcessingResult {
  const transfer = unwrapWebhookPayload(payload);
  if (!isRecord(transfer) || Object.keys(transfer).length === 0) {
    return {
      eventType,
      status: 'failed',
      errorMessage: 'failed to parse transfer payload',
    };
  }

  const transactionId = pickString(transfer, 'transactionId', 'transaction_id') ?? '';
  const amountStr = jsonNumberToAmountString(transfer.amount) ?? '0';

  return {
    providerTxId: transactionId || undefined,
    eventType,
    status: 'completed',
    updatedFields: {
      amount: amountStr,
      currency: pickString(transfer, 'currency') ?? jsonNumberToAmountString(transfer.currency) ?? '',
      end_to_end_id: pickString(transfer, 'endToEndId', 'end_to_end_id') ?? '',
      status: pickString(transfer, 'status') ?? '',
    },
    requiresAction: 'mark_settlement_complete',
  };
}

function processPIXOutFailed(eventType: string, payload: unknown): WebhookProcessingResult {
  const transfer = unwrapWebhookPayload(payload);
  if (!isRecord(transfer) || Object.keys(transfer).length === 0) {
    return {
      eventType,
      status: 'failed',
      errorMessage: 'failed to parse transfer payload',
    };
  }

  const transactionId = pickString(transfer, 'transactionId', 'transaction_id') ?? '';
  const errorMessage =
    pickString(transfer, 'errorMessage', 'error_message', 'message') ?? '';

  return {
    providerTxId: transactionId || undefined,
    eventType,
    status: 'failed',
    errorMessage: errorMessage || undefined,
    updatedFields: {
      error_code: pickString(transfer, 'errorCode', 'error_code') ?? '',
    },
    requiresAction: 'mark_settlement_failed',
  };
}

/** Dynamic PIX QR paid — matches `txid` returned from generateDynamicPIX. */
function processQRCodePaid(eventType: string, payload: unknown): WebhookProcessingResult {
  const qr = unwrapWebhookPayload(payload);
  if (!isRecord(qr) || Object.keys(qr).length === 0) {
    return {
      eventType,
      status: 'failed',
      errorMessage: 'failed to parse QR code payment payload',
    };
  }

  // CorpX `qrcode.paid` docs: `identifier` is the dynamic QR txid.
  const txid = pickString(qr, 'txid', 'txId', 'TXID', 'identifier') ?? '';
  const amountStr = jsonNumberToAmountString(
    qr.paidAmount ?? qr.paid_amount ?? qr.amount ?? qr.value ?? qr.valor,
  );

  if (!txid || !amountStr || !isStrictlyPositiveAmount(amountStr)) {
    return {
      eventType,
      status: 'failed',
      errorMessage: 'invalid QR code payment: missing txid or invalid amount',
    };
  }

  const transactionId = pickString(qr, 'transactionId', 'transaction_id', 'bigPixId', 'paymentId');

  return {
    providerTxId: txid,
    eventType,
    status: 'completed',
    updatedFields: {
      amount: amountStr,
      txid,
      transaction_id: transactionId ?? '',
      identifier: pickString(qr, 'identifier') ?? '',
      end_to_end_id: pickString(qr, 'endToEndId', 'end_to_end_id', 'e2eId') ?? '',
      payer_name: pickString(qr, 'payerName', 'payer_name') ?? '',
      payer_document: pickString(qr, 'payerDocument', 'payer_document') ?? '',
    },
    requiresAction: 'update_balance',
  };
}

/**
 * CorpX webhook verification is IP allowlist–style (payload is ignored for auth, like the Go adapter).
 */
export class CorpXWebhookProcessor {
  private readonly allowedIps: ReadonlySet<string>;

  constructor(allowedIps: ReadonlySet<string>) {
    this.allowedIps = allowedIps;
  }

  static fromEnv(): CorpXWebhookProcessor {
    return new CorpXWebhookProcessor(loadCorpXWebhookIpAllowlist());
  }

  validateWebhookSignature(_payload: string, clientIp: string): boolean {
    if (!clientIp || clientIp === 'unknown') return false;
    return this.allowedIps.has(clientIp);
  }

  processWebhookEvent(eventType: string, payload: unknown): WebhookProcessingResult {
    return processCorpXWebhookEvent(eventType, payload);
  }
}
