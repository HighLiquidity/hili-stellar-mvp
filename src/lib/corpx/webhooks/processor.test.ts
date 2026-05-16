import { describe, expect, it } from 'vitest';

import { normalizeCorpXWebhookEventType, parseCorpXWebhookEnvelope } from './envelope';
import { processCorpXWebhookEvent } from './processor';

describe('CorpX webhook processor', () => {
  it('maps qrcode.paid header alias', () => {
    expect(normalizeCorpXWebhookEventType('qrcode.paid')).toBe('qr_code_paid');
  });

  it('parses nested qr_code_paid payload', () => {
    const result = processCorpXWebhookEvent('qr_code_paid', {
      data: {
        txid: 'dynamic-tx-42',
        paid_amount: '99.90',
        transactionId: 'settlement-99',
        endToEndId: 'E2E-1',
      },
    });
    expect(result.status).toBe('completed');
    expect(result.requiresAction).toBe('update_balance');
    expect(result.providerTxId).toBe('dynamic-tx-42');
    expect(result.updatedFields?.amount).toBe('99.90');
    expect(result.updatedFields?.txid).toBe('dynamic-tx-42');
  });

  it('uses identifier as txid for CorpX qrcode.paid shape', () => {
    const result = processCorpXWebhookEvent('qr_code_paid', {
      endToEnd: 'E2E-qr',
      type: 'dynamic',
      identifier: 'txid-from-identifier',
      amount: 25,
    });
    expect(result.status).toBe('completed');
    expect(result.updatedFields?.txid).toBe('txid-from-identifier');
    expect(result.updatedFields?.amount).toBe('25.00');
  });

  it('parses envelope with X-Webhook-Event style body', () => {
    const { eventType, payload } = parseCorpXWebhookEnvelope(
      { event: 'qrcode.paid', data: { txid: 't1', paidAmount: 10 } },
      null,
    );
    expect(eventType).toBe('qr_code_paid');
    const result = processCorpXWebhookEvent(eventType, payload);
    expect(result.updatedFields?.txid).toBe('t1');
    expect(result.updatedFields?.amount).toBe('10.00');
  });
});
