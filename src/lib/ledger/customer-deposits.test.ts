import { describe, expect, it } from 'vitest';

import { filterCustomerLedgerDeposits } from './customer-deposits';

describe('filterCustomerLedgerDeposits', () => {
  it('keeps withdrawals regardless of charge tax id', () => {
    const rows = [
      { entry_type: 'withdraw', source_id: 'withdraw:abc' },
      { entry_type: 'deposit', source_id: 'deposit:orphan' },
    ];
    expect(filterCustomerLedgerDeposits(rows, new Set())).toEqual([
      { entry_type: 'withdraw', source_id: 'withdraw:abc' },
    ]);
  });

  it('keeps deposits whose CorpX txid was issued with a tax id', () => {
    const rows = [
      { entry_type: 'deposit', source_id: 'deposit:customer-qr' },
      { entry_type: 'deposit', source_id: 'deposit:treasury-orphan' },
    ];
    expect(filterCustomerLedgerDeposits(rows, new Set(['customer-qr']))).toEqual([
      { entry_type: 'deposit', source_id: 'deposit:customer-qr' },
    ]);
  });
});
