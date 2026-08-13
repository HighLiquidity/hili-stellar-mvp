import { describe, expect, it } from 'vitest';

import {
  formatTreasuryCorpxInboundStepDetail,
  pickTreasuryBrlReceiveMatch,
  TREASURY_CORPX_INBOUND_STEP,
  type TreasuryBrlReceiveMatchCandidate,
} from './match-inbound-pix';

function run(
  overrides: Partial<TreasuryBrlReceiveMatchCandidate> & Pick<TreasuryBrlReceiveMatchCandidate, 'id'>,
): TreasuryBrlReceiveMatchCandidate {
  return {
    kind: 'binance_brl_to_corpx',
    status: 'completed',
    dry_run: false,
    requested_amount_usdc: '12000',
    executed_amount_usdc: '12000',
    created_at: '2026-08-11T22:00:00.000Z',
    steps: [],
    ...overrides,
  };
}

describe('pickTreasuryBrlReceiveMatch', () => {
  const now = new Date('2026-08-12T13:00:00.000Z');

  it('matches a completed Binance→CorpX run by canonical BRL amount', () => {
    const matched = pickTreasuryBrlReceiveMatch(
      [run({ id: 'run-1', requested_amount_usdc: '12000.00', executed_amount_usdc: null })],
      '12000.00',
      now,
    );
    expect(matched?.id).toBe('run-1');
  });

  it('ignores dry-run, failed, and already-matched runs', () => {
    const matched = pickTreasuryBrlReceiveMatch(
      [
        run({ id: 'dry', dry_run: true }),
        run({ id: 'failed', status: 'failed' }),
        run({
          id: 'used',
          steps: [{ name: TREASURY_CORPX_INBOUND_STEP, status: 'ok' }],
        }),
      ],
      '12000',
      now,
    );
    expect(matched).toBeNull();
  });

  it('picks the oldest unmatched run when two share the same amount', () => {
    const matched = pickTreasuryBrlReceiveMatch(
      [
        run({ id: 'newer', created_at: '2026-08-11T23:00:00.000Z' }),
        run({ id: 'older', created_at: '2026-08-11T21:00:00.000Z' }),
      ],
      '12000',
      now,
    );
    expect(matched?.id).toBe('older');
  });

  it('does not match amounts outside the window or a different value', () => {
    expect(
      pickTreasuryBrlReceiveMatch(
        [run({ id: 'stale', created_at: '2026-08-01T00:00:00.000Z' })],
        '12000',
        now,
      ),
    ).toBeNull();

    expect(
      pickTreasuryBrlReceiveMatch(
        [run({ id: 'other', requested_amount_usdc: '500', executed_amount_usdc: '500' })],
        '12000',
        now,
      ),
    ).toBeNull();
  });

  it('formats the inbound step without inventing an e2e id', () => {
    expect(
      formatTreasuryCorpxInboundStepDetail({
        corpxTxid: 'tx-1',
        eventType: 'pix_in_received',
      }),
    ).toBe('txid=tx-1 event=pix_in_received');
  });
});
