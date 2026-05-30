import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OnrampOrderRow } from './order-store';

const updateOnrampOrderMock = vi.fn();

vi.mock('./order-store', () => ({
  findOnrampOrderById: vi.fn(),
  markOnrampOrderStatus: vi.fn(),
  updateOnrampOrder: updateOnrampOrderMock,
}));

vi.mock('@/lib/server/binance', () => ({
  binance: {
    market: {
      placeMarketOrderByQuoteAmount: vi.fn(),
    },
    withdraw: {
      requestCryptoWithdraw: vi.fn(),
    },
  },
}));

function makeOrder(overrides: Partial<OnrampOrderRow> = {}): OnrampOrderRow {
  return {
    id: '1198dd41-ef15-47d6-a937-ef5bce07a7c4',
    status: 'usdc_delivered',
    tax_id: '12345678900',
    amount_brl: '100.00',
    amount_usdc: '18.2268185',
    destination_address: `G${'A'.repeat(55)}`,
    destination_memo: null,
    quote_symbol: 'USDCBRL',
    quote_side: 'BUY',
    quote_expires_at: new Date(Date.now() + 60_000).toISOString(),
    quote_locked_at: new Date().toISOString(),
    quote_rate: '5.486421',
    quote_source: 'test',
    quote_spread_bps: 0,
    corpx_txid: 'pix-1',
    corpx_identifier: null,
    corpx_expires_at: null,
    pix_copy_paste: null,
    corpx_event_type: null,
    corpx_transaction_id: null,
    end_to_end_id: null,
    brh_sale_external_id: null,
    brh_sale_ramp_operation_id: null,
    usdc_delivery_external_id: null,
    usdc_delivery_ramp_operation_id: null,
    usdc_delivery_tx_hash: null,
    binance_symbol: null,
    binance_side: null,
    binance_quote_order_qty: null,
    binance_client_order_id: null,
    binance_order_id: null,
    binance_executed_qty: null,
    binance_cummulative_quote_qty: null,
    binance_status: null,
    brh_redemption_external_id: null,
    brh_redemption_ramp_operation_id: null,
    binance_withdraw_order_id: null,
    binance_withdraw_id: null,
    binance_withdraw_network: null,
    binance_withdraw_amount: null,
    failure_code: null,
    failure_reason: null,
    needs_review_reason: null,
    created_by_user_id: null,
    created_by_email: null,
    quoted_at: new Date().toISOString(),
    pix_received_at: new Date().toISOString(),
    brh_sold_at: new Date().toISOString(),
    usdc_delivered_at: new Date().toISOString(),
    fx_settled_at: null,
    brh_redeemed_at: null,
    complete_at: null,
    expired_at: null,
    refunded_at: null,
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

let prepareOnrampBinanceReconciliationIds: (
  order: OnrampOrderRow,
) => Promise<OnrampOrderRow | null>;

describe('prepareOnrampBinanceReconciliationIds', () => {
  beforeAll(async () => {
    ({ prepareOnrampBinanceReconciliationIds } = await import('./reconciliation'));
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refreshes legacy colon-separated ids before reconciliation', async () => {
    const order = makeOrder({
      binance_client_order_id: 'onramp:1198dd41-ef15-47d6-a937-ef5bce07a7c4:fx',
      binance_withdraw_order_id: 'onramp:1198dd41-ef15-47d6-a937-ef5bce07a7c4:usdc-refill',
    });

    updateOnrampOrderMock.mockResolvedValue({
      ok: true,
      row: makeOrder({
        binance_client_order_id: 'orf_1198dd41ef1547d6a937ef5bce07a7c4',
        binance_withdraw_order_id: 'orw_1198dd41ef1547d6a937ef5bce07a7c4',
      }),
    });

    const prepared = await prepareOnrampBinanceReconciliationIds(order);

    expect(updateOnrampOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: order.id,
        patch: {
          binance_client_order_id: 'orf_1198dd41ef1547d6a937ef5bce07a7c4',
          binance_withdraw_order_id: 'orw_1198dd41ef1547d6a937ef5bce07a7c4',
        },
      }),
    );
    expect(prepared?.binance_client_order_id).toBe('orf_1198dd41ef1547d6a937ef5bce07a7c4');
    expect(prepared?.binance_withdraw_order_id).toBe('orw_1198dd41ef1547d6a937ef5bce07a7c4');
  });

  it('returns the order unchanged when ids are already legal', async () => {
    const order = makeOrder({
      binance_client_order_id: 'orf_1198dd41ef1547d6a937ef5bce07a7c4',
      binance_withdraw_order_id: 'orw_1198dd41ef1547d6a937ef5bce07a7c4',
    });

    const prepared = await prepareOnrampBinanceReconciliationIds(order);

    expect(updateOnrampOrderMock).not.toHaveBeenCalled();
    expect(prepared).toBe(order);
  });
});
