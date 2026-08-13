import { describe, expect, it } from 'vitest';

import { buildCorpXWebhookDedupeKey } from './dedupe';

function headers(init?: Record<string, string>): Headers {
  return new Headers(init);
}

describe('buildCorpXWebhookDedupeKey', () => {
  it('dedupes qrcode.paid and pix.in.received on the same end-to-end id', () => {
    const qrKey = buildCorpXWebhookDedupeKey(
      headers({ 'x-webhook-id': 'wh-qr-1' }),
      'qr_code_paid',
      { txid: 'qr-txid', endToEndId: 'E2E-SHARED', amount: 60 },
      '{}',
    );
    const pixInKey = buildCorpXWebhookDedupeKey(
      headers({ 'x-webhook-id': 'wh-in-2' }),
      'pix_in_received',
      { transactionId: 'settlement-99', endToEndId: 'E2E-SHARED', amount: 60 },
      '{}',
    );

    expect(qrKey).toBe('corpx:inbound:e2e:E2E-SHARED');
    expect(pixInKey).toBe(qrKey);
  });

  it('does not let a unique webhook id split inbound events of the same PIX', () => {
    const key = buildCorpXWebhookDedupeKey(
      headers({ 'idempotency-key': 'unique-delivery' }),
      'pix_in_received',
      { txid: 'charge-1', endToEndId: 'E2E-1' },
      '{}',
    );
    expect(key).toBe('corpx:inbound:e2e:E2E-1');
  });

  it('falls back to inbound txid when e2e is absent', () => {
    const qrKey = buildCorpXWebhookDedupeKey(
      headers(),
      'qr_code_paid',
      { identifier: 'dynamic-qr-1', paidAmount: 10 },
      '{}',
    );
    const again = buildCorpXWebhookDedupeKey(
      headers(),
      'pix_in_received',
      { txid: 'dynamic-qr-1', amount: 10 },
      '{}',
    );
    expect(qrKey).toBe('corpx:inbound:txid:dynamic-qr-1');
    expect(again).toBe(qrKey);
  });

  it('keeps outbound events namespaced so they cannot collide with inbound e2e', () => {
    const inbound = buildCorpXWebhookDedupeKey(
      headers(),
      'pix_in_received',
      { endToEndId: 'E2E-SAME' },
      '{}',
    );
    const outbound = buildCorpXWebhookDedupeKey(
      headers(),
      'pix_out_completed',
      { endToEndId: 'E2E-SAME', transactionId: 'out-1' },
      '{}',
    );
    expect(inbound).toBe('corpx:inbound:e2e:E2E-SAME');
    expect(outbound).not.toBe(inbound);
    expect(outbound).toContain('pix_out_completed');
  });
});
