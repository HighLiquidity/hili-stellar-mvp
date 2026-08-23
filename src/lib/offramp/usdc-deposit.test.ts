import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OfframpOrderRow } from './order-store';

const {
  getRampOperationMock,
  findOfframpOrderByIdMock,
  retryOfframpReconciliationMock,
  markOfframpOrderStatusMock,
  findOfframpOrderByUsdcDepositExternalIdMock,
} = vi.hoisted(() => ({
  getRampOperationMock: vi.fn(),
  findOfframpOrderByIdMock: vi.fn(),
  retryOfframpReconciliationMock: vi.fn(),
  markOfframpOrderStatusMock: vi.fn(),
  findOfframpOrderByUsdcDepositExternalIdMock: vi.fn(),
}));

vi.mock('@/lib/ramp/client', () => ({
  getRampOperation: getRampOperationMock,
}));

vi.mock('@/lib/ramp/config', () => ({
  isRampConfigured: () => true,
}));

vi.mock('./order-store', () => ({
  findOfframpOrderById: findOfframpOrderByIdMock,
  findOfframpOrderByUsdcDepositExternalId: findOfframpOrderByUsdcDepositExternalIdMock,
  markOfframpOrderStatus: markOfframpOrderStatusMock,
  updateOfframpOrder: vi.fn(),
}));

vi.mock('./reconciliation', () => ({
  retryOfframpReconciliation: retryOfframpReconciliationMock,
}));

vi.mock('@/lib/fiat-operations/log-offramp', () => ({
  logOfframpEvent: vi.fn(),
}));

import {
  extractUsdcDepositFieldsFromRampDocument,
  mapUsdcDepositRampStatusToOfframpStatus,
  shouldSyncOfframpUsdcDeposit,
} from './usdc-deposit';

function makeOrder(overrides: Partial<OfframpOrderRow> = {}): OfframpOrderRow {
  return {
    id: 'order-123',
    status: 'awaiting_deposit',
    amount_usdc: '5.00',
    amount_brl: '27.50',
    quote_symbol: 'USDCBRL',
    quote_side: 'SELL',
    quote_rate: '5.5',
    quote_source: 'test',
    quote_spread_bps: 0,
    quote_expires_at: new Date(Date.now() + 60_000).toISOString(),
    quote_locked_at: new Date().toISOString(),
    payout_pix_key: 'user@example.com',
    payout_beneficiary_name: 'Test User',
    payout_reference: null,
    payout_provider_tx_id: null,
    payout_end_to_end_id: null,
    usdc_deposit_external_id: 'offramp-usdc-deposit:order-123',
    usdc_deposit_ramp_operation_id: 'op-usdc-1',
    usdc_deposit_address: 'G...DEPOSIT',
    usdc_deposit_memo: 'MEMO123',
    usdc_deposit_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    usdc_received_amount: null,
    usdc_received_tx_hash: 'stellar-tx-hash',
    brh_issue_external_id: null,
    brh_issue_ramp_operation_id: null,
    brh_redemption_external_id: null,
    brh_redemption_ramp_operation_id: null,
    binance_symbol: null,
    binance_side: null,
    binance_client_order_id: null,
    binance_order_id: null,
    binance_executed_qty: null,
    binance_cummulative_quote_qty: null,
    binance_status: null,
    treasury_usdc_close_run_id: null,
    treasury_usdc_close_external_id: null,
    treasury_brl_close_run_id: null,
    treasury_brl_close_fiat_order_id: null,
    failure_code: null,
    failure_reason: null,
    needs_review_reason: null,
    created_by_user_id: null,
    created_by_email: null,
    integrator_external_id: null,
    quoted_at: new Date().toISOString(),
    usdc_received_at: null,
    pix_sent_at: null,
    brh_recorded_at: null,
    fx_settled_at: null,
    complete_at: null,
    expired_at: null,
    refunded_at: null,
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('mapUsdcDepositRampStatusToOfframpStatus', () => {
  it('maps completed off-ramp deposits to usdc_received', () => {
    expect(mapUsdcDepositRampStatusToOfframpStatus('completed')).toEqual({
      nextStatus: 'usdc_received',
      failureCode: null,
    });
  });
});

describe('extractUsdcDepositFieldsFromRampDocument', () => {
  it('prefers depositTxHash and receivedAmount from ramp document', () => {
    expect(
      extractUsdcDepositFieldsFromRampDocument({
        id: 'op-usdc-1',
        status: 'completed',
        depositTxHash: ' deposit-hash ',
        receivedAmount: ' 5.0 ',
      }),
    ).toEqual({
      rampOperationId: 'op-usdc-1',
      status: 'completed',
      txHash: 'deposit-hash',
      amount: '5.0',
      failureReason: null,
    });
  });
});

describe('shouldSyncOfframpUsdcDeposit', () => {
  it('returns true for awaiting_deposit orders with ramp ids', () => {
    expect(shouldSyncOfframpUsdcDeposit(makeOrder())).toBe(true);
  });

  it('returns false after usdc_received', () => {
    expect(shouldSyncOfframpUsdcDeposit(makeOrder({ status: 'usdc_received' }))).toBe(false);
  });
});

describe('syncOfframpUsdcDepositFromRamp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRampOperationMock.mockResolvedValue({
      id: 'op-usdc-1',
      status: 'completed',
      depositTxHash: 'stellar-tx-hash',
      receivedAmount: '5.0',
    });
    findOfframpOrderByUsdcDepositExternalIdMock.mockImplementation(async () => makeOrder());
    markOfframpOrderStatusMock.mockImplementation(async ({ status }: { status: string }) => ({
      ok: true,
      row: makeOrder({ status: status as OfframpOrderRow['status'], usdc_received_at: new Date().toISOString() }),
    }));
    findOfframpOrderByIdMock.mockResolvedValue(makeOrder({ status: 'usdc_received' }));
    retryOfframpReconciliationMock.mockResolvedValue({ accepted: true, orderId: 'order-123' });
  });

  it('promotes awaiting_deposit to usdc_received when ramp reports completed', async () => {
    const { syncOfframpUsdcDepositFromRamp } = await import('./usdc-deposit');

    const result = await syncOfframpUsdcDepositFromRamp(makeOrder());

    expect(getRampOperationMock).toHaveBeenCalledWith('op-usdc-1');
    expect(markOfframpOrderStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'usdc_received',
      }),
    );
    expect(retryOfframpReconciliationMock).toHaveBeenCalledWith('order-123');
    expect(result.status).toBe('usdc_received');
  });
});
