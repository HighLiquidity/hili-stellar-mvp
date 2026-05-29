import { describe, expect, it } from 'vitest';

import type { LedgerTransaction } from './types';
import { sumLedgerVolumes, sumUsdcVolumes } from './volumes';

function tx(partial: Partial<LedgerTransaction> & Pick<LedgerTransaction, 'id' | 'type' | 'amountBrl'>): LedgerTransaction {
  return {
    kind: 'ledger',
    createdAt: '2026-05-26T10:00:00.000Z',
    pixE2eId: null,
    txHash: null,
    beneficiaryName: null,
    detail: null,
    orderId: null,
    orderFlow: null,
    ...partial,
  };
}

describe('sumUsdcVolumes', () => {
  it('sums on-ramp and off-ramp USDC from detail lines', () => {
    const result = sumUsdcVolumes([
      tx({
        id: 'onramp:1',
        kind: 'onramp',
        type: 'deposit',
        amountBrl: '100',
        detail: '18.50 USDC',
      }),
      tx({
        id: 'offramp:1',
        kind: 'offramp',
        type: 'withdraw',
        amountBrl: '200',
        detail: '37.00 USDC',
      }),
      tx({ id: 'ledger:1', type: 'deposit', amountBrl: '50' }),
    ]);

    expect(result.usdcReceived).toBe(18.5);
    expect(result.usdcSent).toBe(37);
  });
});

describe('sumLedgerVolumes', () => {
  it('includes ramp fiat legs in BRL totals', () => {
    const result = sumLedgerVolumes([
      tx({ id: 'a', type: 'deposit', amountBrl: '100' }),
      tx({ id: 'b', kind: 'onramp', type: 'deposit', amountBrl: '50', detail: '10 USDC' }),
      tx({ id: 'c', kind: 'offramp', type: 'withdraw', amountBrl: '30', detail: '5 USDC' }),
    ]);

    expect(result.incomingBrl).toBe(150);
    expect(result.outgoingBrl).toBe(30);
  });
});
