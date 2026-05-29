import { describe, expect, it } from 'vitest';

import {
  mapOfframpOrdersToTransactions,
  mapOnrampOrdersToTransactions,
  paginateStatementTransactions,
  sortStatementTransactions,
} from './map-ramp-orders';

describe('statement ramp mapping', () => {
  it('maps on-ramp PIX received as deposit lines', () => {
    const [tx] = mapOnrampOrdersToTransactions([
      {
        id: '11111111-1111-1111-1111-111111111111',
        amount_brl: '100.00',
        amount_usdc: '18.50',
        pix_received_at: '2026-05-26T10:00:00.000Z',
        end_to_end_id: 'e2e-on',
        usdc_delivery_tx_hash: 'abc123',
        destination_address: 'GABC',
      },
    ]);

    expect(tx.id).toBe('onramp:11111111-1111-1111-1111-111111111111');
    expect(tx.kind).toBe('onramp');
    expect(tx.type).toBe('deposit');
    expect(tx.detail).toBe('18.50 USDC');
    expect(tx.txHash).toBe('abc123');
  });

  it('maps off-ramp PIX sent as withdraw lines', () => {
    const [tx] = mapOfframpOrdersToTransactions([
      {
        id: '22222222-2222-2222-2222-222222222222',
        amount_brl: '200.00',
        amount_usdc: '37.00',
        pix_sent_at: '2026-05-26T11:00:00.000Z',
        payout_end_to_end_id: 'e2e-off',
        payout_beneficiary_name: 'Maria',
        usdc_received_tx_hash: null,
      },
    ]);

    expect(tx.kind).toBe('offramp');
    expect(tx.type).toBe('withdraw');
    expect(tx.beneficiaryName).toBe('Maria');
  });

  it('sorts and paginates merged transactions', () => {
    const merged = sortStatementTransactions([
      {
        id: 'a',
        kind: 'ledger',
        type: 'deposit',
        amountBrl: '1',
        createdAt: '2026-05-26T09:00:00.000Z',
        pixE2eId: null,
        txHash: null,
        beneficiaryName: null,
        detail: null,
        orderId: null,
        orderFlow: null,
      },
      {
        id: 'b',
        kind: 'onramp',
        type: 'deposit',
        amountBrl: '2',
        createdAt: '2026-05-26T12:00:00.000Z',
        pixE2eId: null,
        txHash: null,
        beneficiaryName: null,
        detail: null,
        orderId: null,
        orderFlow: null,
      },
    ]);

    expect(merged[0]?.id).toBe('b');

    const { pageRows, total } = paginateStatementTransactions(merged, 2, 1);
    expect(total).toBe(2);
    expect(pageRows).toHaveLength(1);
    expect(pageRows[0]?.id).toBe('a');
  });
});
