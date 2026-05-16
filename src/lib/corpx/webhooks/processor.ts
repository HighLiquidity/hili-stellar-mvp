import type { WebhookProcessingResult } from './types';
import { loadCorpXWebhookIpAllowlist } from './allowlist';

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/** Re-marshal like Go: `json.Marshal(event.Payload)` then decode. */
function payloadAsRecord(payload: unknown): Record<string, unknown> | null {
  try {
    const bytes = JSON.stringify(payload);
    const v = JSON.parse(bytes) as unknown;
    return isRecord(v) ? v : null;
  } catch {
    return null;
  }
}

function jsonNumberToString(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return (Math.round(v * 100) / 100).toFixed(2);
  }
  if (typeof v === 'string' && v.trim()) return v.trim();
  return null;
}

function isStrictlyPositiveAmount(s: string): boolean {
  const n = Number(s);
  return Number.isFinite(n) && n > 0;
}

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
  const pix = payloadAsRecord(payload);
  if (!pix) {
    return {
      eventType,
      status: 'failed',
      errorMessage: 'failed to parse PIX payment payload',
    };
  }

  const transactionId = typeof pix.transactionId === 'string' ? pix.transactionId.trim() : '';
  const amountStr = jsonNumberToString(pix.amount);

  if (!transactionId || !amountStr || !isStrictlyPositiveAmount(amountStr)) {
    return {
      eventType,
      status: 'failed',
      errorMessage: 'invalid PIX payment: missing transaction ID or invalid amount',
    };
  }

  return {
    providerTxId: transactionId,
    eventType,
    status: 'completed',
    updatedFields: {
      amount: amountStr,
      currency:
        typeof pix.currency === 'string' ? pix.currency : (jsonNumberToString(pix.currency) ?? ''),
      end_to_end_id: typeof pix.endToEndId === 'string' ? pix.endToEndId : '',
      payer_name: typeof pix.payerName === 'string' ? pix.payerName : '',
      payer_document: typeof pix.payerDocument === 'string' ? pix.payerDocument : '',
      account_id: typeof pix.accountId === 'string' ? pix.accountId : '',
    },
    requiresAction: 'update_balance',
  };
}

function processPIXOutCompleted(eventType: string, payload: unknown): WebhookProcessingResult {
  const transfer = payloadAsRecord(payload);
  if (!transfer) {
    return {
      eventType,
      status: 'failed',
      errorMessage: 'failed to parse transfer payload',
    };
  }

  const transactionId = typeof transfer.transactionId === 'string' ? transfer.transactionId.trim() : '';
  const amountStr = jsonNumberToString(transfer.amount) ?? '0';

  return {
    providerTxId: transactionId || undefined,
    eventType,
    status: 'completed',
    updatedFields: {
      amount: amountStr,
      currency: typeof transfer.currency === 'string' ? transfer.currency : (jsonNumberToString(transfer.currency) ?? ''),
      end_to_end_id: typeof transfer.endToEndId === 'string' ? transfer.endToEndId : '',
      status: typeof transfer.status === 'string' ? transfer.status : '',
    },
    requiresAction: 'mark_settlement_complete',
  };
}

function processPIXOutFailed(eventType: string, payload: unknown): WebhookProcessingResult {
  const transfer = payloadAsRecord(payload);
  if (!transfer) {
    return {
      eventType,
      status: 'failed',
      errorMessage: 'failed to parse transfer payload',
    };
  }

  const transactionId = typeof transfer.transactionId === 'string' ? transfer.transactionId.trim() : '';
  let errorMessage = '';
  if (typeof transfer.errorMessage === 'string') errorMessage = transfer.errorMessage;
  else if (typeof transfer.message === 'string') errorMessage = transfer.message;

  return {
    providerTxId: transactionId || undefined,
    eventType,
    status: 'failed',
    errorMessage: errorMessage || undefined,
    updatedFields: {
      error_code: typeof transfer.errorCode === 'string' ? transfer.errorCode : '',
    },
    requiresAction: 'mark_settlement_failed',
  };
}

function processQRCodePaid(eventType: string, payload: unknown): WebhookProcessingResult {
  const qr = payloadAsRecord(payload);
  if (!qr) {
    return {
      eventType,
      status: 'failed',
      errorMessage: 'failed to parse QR code payment payload',
    };
  }

  const txid = typeof qr.txid === 'string' ? qr.txid.trim() : '';
  const amountStr = jsonNumberToString(qr.paidAmount ?? qr.amount ?? qr.value);

  if (!txid || !amountStr || !isStrictlyPositiveAmount(amountStr)) {
    return {
      eventType,
      status: 'failed',
      errorMessage: 'invalid QR code payment: missing txid or invalid amount',
    };
  }

  const transactionId = typeof qr.transactionId === 'string' ? qr.transactionId.trim() : '';

  return {
    providerTxId: transactionId || undefined,
    eventType,
    status: 'completed',
    updatedFields: {
      amount: amountStr,
      txid,
      identifier: typeof qr.identifier === 'string' ? qr.identifier : '',
      end_to_end_id: typeof qr.endToEndId === 'string' ? qr.endToEndId : '',
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

  /**
   * @param _payload Raw body string (unused; reserved if CorpX adds signature later).
   * @param clientIp Source IP string (from {@link getRequestClientIp}).
   */
  validateWebhookSignature(_payload: string, clientIp: string): boolean {
    if (!clientIp || clientIp === 'unknown') return false;
    return this.allowedIps.has(clientIp);
  }

  processWebhookEvent(eventType: string, payload: unknown): WebhookProcessingResult {
    return processCorpXWebhookEvent(eventType, payload);
  }
}
