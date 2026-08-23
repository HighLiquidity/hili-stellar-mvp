import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OfframpOrderRow } from './order-store';

const findOfframpOrderByIdMock = vi.fn();
const markOfframpOrderStatusMock = vi.fn();
const createCorpXAdapterFromEnvMock = vi.fn();
const logOfframpEventMock = vi.fn();
const placeMarketOrderByQuoteAmountMock = vi.fn();
const startOfframpBrhIssueForOrderMock = vi.fn();
const startOfframpBrhRedemptionForOrderMock = vi.fn();
const findRampOperationByExternalIdMock = vi.fn();

vi.mock('./order-store', () => ({
  findOfframpOrderById: findOfframpOrderByIdMock,
  markOfframpOrderStatus: markOfframpOrderStatusMock,
}));

vi.mock('@/lib/treasury/offramp-close', () => ({
  startOfframpTreasuryCloseForOrderId: vi.fn().mockResolvedValue({ skipped: 'flag_off' }),
  startOfframpTreasuryClose: vi.fn().mockResolvedValue({ skipped: 'flag_off' }),
}));

vi.mock('@/lib/corpx/adapter', () => ({
  createCorpXAdapterFromEnv: createCorpXAdapterFromEnvMock,
}));

vi.mock('@/lib/fiat-operations/log-offramp', () => ({
  logOfframpEvent: logOfframpEventMock,
}));

vi.mock('@/lib/server/binance', () => ({
  binance: {
    market: {
      placeMarketOrderByQuoteAmount: placeMarketOrderByQuoteAmountMock,
    },
  },
}));

vi.mock('./brh-record', () => ({
  startOfframpBrhIssueForOrder: startOfframpBrhIssueForOrderMock,
  startOfframpBrhRedemptionForOrder: startOfframpBrhRedemptionForOrderMock,
  resolveOfframpBrhIssueRampStatus: vi.fn(async (order: OfframpOrderRow) => {
    const externalId = order.brh_issue_external_id ?? 'offramp-brh-issue:order-123';
    return findRampOperationByExternalIdMock(externalId).then((op: { status?: string } | null) => op?.status ?? null);
  }),
  resolveOfframpBrhRedemptionRampStatus: vi.fn(async (order: OfframpOrderRow) => {
    const externalId = order.brh_redemption_external_id ?? 'offramp-brh-redemption:order-123';
    return findRampOperationByExternalIdMock(externalId).then((op: { status?: string } | null) => op?.status ?? null);
  }),
}));

vi.mock('./pix-payout-sync', () => ({
  syncOfframpPixPayoutFromCorpX: vi.fn(async (order: OfframpOrderRow) => order),
}));

vi.mock('@/lib/ramp/operation-store', () => ({
  findRampOperationByExternalId: findRampOperationByExternalIdMock,
}));

let retryOfframpReconciliation: (orderId: string) => Promise<{ accepted: true; orderId: string }>;

function makeOrder(overrides: Partial<OfframpOrderRow> = {}): OfframpOrderRow {
  return {
    id: 'order-123',
    status: 'pix_sent',
    amount_usdc: '100.00',
    amount_brl: '550.00',
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
    payout_provider_tx_id: 'pix-provider-1',
    payout_end_to_end_id: 'e2e-1',
    usdc_deposit_external_id: 'offramp-usdc-deposit:order-123',
    usdc_deposit_ramp_operation_id: 'ramp-deposit-1',
    usdc_deposit_address: 'G...USDC',
    usdc_deposit_memo: 'K5QF3ZB7H2N8XA1C',
    usdc_deposit_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    usdc_received_amount: '100.00',
    usdc_received_tx_hash: '0xtx',
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
    usdc_received_at: new Date().toISOString(),
    pix_sent_at: new Date().toISOString(),
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

describe('offramp reconciliation orchestration', () => {
  beforeAll(async () => {
    ({ retryOfframpReconciliation } = await import('./reconciliation'));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    createCorpXAdapterFromEnvMock.mockResolvedValue({
      pix: {
        initiatePIXCashOut: vi.fn(),
      },
    });
    markOfframpOrderStatusMock.mockImplementation(async ({ status, patch }: { status: string; patch?: Record<string, unknown> }) => ({
      ok: true,
      row: makeOrder({
        status: status as OfframpOrderRow['status'],
        ...((patch ?? {}) as Partial<OfframpOrderRow>),
      }),
    }));
    startOfframpBrhIssueForOrderMock.mockResolvedValue({
      externalId: 'offramp-brh-issue:order-123',
      rampOperationId: 'ramp-brh-issue-1',
      status: 'pending',
    });
    startOfframpBrhRedemptionForOrderMock.mockResolvedValue({
      externalId: 'offramp-brh-redemption:order-123',
      rampOperationId: 'ramp-brh-1',
      status: 'pending',
    });
    findRampOperationByExternalIdMock.mockImplementation(async (externalId: string) => {
      if (externalId.includes('issue')) {
        return { status: 'pending', ramp_operation_id: 'ramp-brh-issue-1' };
      }
      return { status: 'pending', ramp_operation_id: 'ramp-brh-1' };
    });
    placeMarketOrderByQuoteAmountMock.mockResolvedValue({
      symbol: 'USDCBRL',
      side: 'SELL',
      orderId: 999,
      executedQty: '100.00',
      cummulativeQuoteQty: '550.00',
      status: 'FILLED',
    });
  });

  it('does not execute FX while BRH redemption is still pending confirmation', async () => {
    findOfframpOrderByIdMock
      .mockResolvedValueOnce(makeOrder({ status: 'pix_sent' }))
      .mockResolvedValueOnce(makeOrder({ status: 'pix_sent' }))
      .mockResolvedValueOnce(makeOrder({ status: 'pix_sent' }));

    await retryOfframpReconciliation('order-123');

    expect(startOfframpBrhIssueForOrderMock).toHaveBeenCalledTimes(1);
    expect(startOfframpBrhRedemptionForOrderMock).not.toHaveBeenCalled();
    expect(placeMarketOrderByQuoteAmountMock).not.toHaveBeenCalled();
  });

  it('submits BRH redemption only after issue is confirmed', async () => {
    findRampOperationByExternalIdMock.mockImplementation(async (externalId: string) => {
      if (externalId.includes('issue')) {
        return { status: 'confirmed', ramp_operation_id: 'ramp-brh-issue-1' };
      }
      return { status: 'pending', ramp_operation_id: 'ramp-brh-1' };
    });

    findOfframpOrderByIdMock
      .mockResolvedValueOnce(makeOrder({ status: 'pix_sent' }))
      .mockResolvedValueOnce(makeOrder({ status: 'pix_sent' }))
      .mockResolvedValueOnce(makeOrder({ status: 'pix_sent' }));

    await retryOfframpReconciliation('order-123');

    expect(startOfframpBrhIssueForOrderMock).toHaveBeenCalledTimes(1);
    expect(startOfframpBrhRedemptionForOrderMock).toHaveBeenCalledTimes(1);
    expect(placeMarketOrderByQuoteAmountMock).not.toHaveBeenCalled();
  });

  it('executes FX and marks complete only after brh_recorded', async () => {
    findOfframpOrderByIdMock
      .mockResolvedValueOnce(makeOrder({ status: 'brh_recorded', brh_redemption_external_id: 'offramp-brh-redemption:order-123' }))
      .mockResolvedValueOnce(makeOrder({ status: 'brh_recorded', brh_redemption_external_id: 'offramp-brh-redemption:order-123' }))
      .mockResolvedValueOnce(makeOrder({ status: 'fx_settled', binance_order_id: '999' }));

    await retryOfframpReconciliation('order-123');

    expect(placeMarketOrderByQuoteAmountMock).toHaveBeenCalledTimes(1);
    expect(markOfframpOrderStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'fx_settled',
      }),
    );
    expect(markOfframpOrderStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'complete',
      }),
    );

    const { startOfframpTreasuryCloseForOrderId } = await import('@/lib/treasury/offramp-close');
    expect(startOfframpTreasuryCloseForOrderId).toHaveBeenCalledWith('order-123');
  });

  it('still attempts treasury close when the order is already complete', async () => {
    findOfframpOrderByIdMock.mockResolvedValueOnce(makeOrder({ status: 'complete' }));

    await retryOfframpReconciliation('order-123');

    const { startOfframpTreasuryCloseForOrderId } = await import('@/lib/treasury/offramp-close');
    expect(startOfframpTreasuryCloseForOrderId).toHaveBeenCalledWith('order-123');
    expect(placeMarketOrderByQuoteAmountMock).not.toHaveBeenCalled();
  });
});
