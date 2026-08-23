import { describe, expect, it } from 'vitest';

import { ONRAMP_FAILURE_CODES } from './failure-codes';
import type { OnrampOrderRow } from './order-store';
import { buildOnrampOrderResponse } from './read';

const baseRow: OnrampOrderRow = {
  id: 'order-123',
  status: 'awaiting_pix',
  tax_id: '12345678900',
  amount_brl: '100.00',
  amount_usdc: '20.00',
  destination_address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  destination_memo: null,
  quote_symbol: 'USDCBRL',
  quote_side: 'BUY',
  quote_expires_at: '2026-05-26T15:00:00.000Z',
  quote_locked_at: '2026-05-26T14:58:10.000Z',
  quote_rate: '5.00',
  quote_source: 'binance:api/v3/ticker/price',
  quote_spread_bps: 0,
  corpx_txid: 'corpx-123',
  corpx_identifier: 'oorder123',
  corpx_expires_at: '2026-05-27T15:00:00.000Z',
  pix_copy_paste: '00020101021226880014br.gov.bcb.pix2566example.com/pix1235204000053039865406100.005802BR5913HighLiquidity6009Sao Paulo62070503***6304ABCD',
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
  treasury_brl_close_run_id: null,
  treasury_brl_close_fiat_order_id: null,
  failure_code: null,
  failure_reason: null,
  needs_review_reason: null,
  created_by_user_id: 'user-123',
  created_by_email: 'operator@example.com',
  integrator_external_id: 'erp-order-12345',
  quoted_at: '2026-05-26T14:58:00.000Z',
  pix_received_at: null,
  brh_sold_at: null,
  usdc_delivered_at: null,
  fx_settled_at: null,
  brh_redeemed_at: null,
  complete_at: null,
  expired_at: null,
  refunded_at: null,
  metadata: {},
  created_at: '2026-05-26T14:58:00.000Z',
  updated_at: '2026-05-26T14:58:10.000Z',
};

describe('buildOnrampOrderResponse', () => {
  it('includes PIX payload, timeline and references', async () => {
    const result = await buildOnrampOrderResponse(baseRow);

    expect(result.orderId).toBe('order-123');
    expect(result.pix).not.toBeNull();
    expect(result.pix?.txid).toBe('corpx-123');
    expect(result.pix?.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(result.timeline.quotedAt).toBe('2026-05-26T14:58:00.000Z');
    expect(result.references.binanceClientOrderId).toBeNull();
    expect(result.failure).toBeNull();
  });

  it('returns null optional sections when data is absent', async () => {
    const result = await buildOnrampOrderResponse({
      ...baseRow,
      status: 'quoted',
      corpx_txid: null,
      pix_copy_paste: null,
      corpx_expires_at: null,
      failure_code: ONRAMP_FAILURE_CODES.QUOTE_EXPIRED,
      failure_reason: 'A quote expirou.',
      needs_review_reason: null,
    });

    expect(result.pix).toBeNull();
    expect(result.failure).toEqual({
      code: ONRAMP_FAILURE_CODES.QUOTE_EXPIRED,
      reason: 'A quote expirou.',
      needsReviewReason: null,
    });
  });
});
