import { NextResponse } from 'next/server';

import { findDepositChargeByTxid } from '@/lib/deposit/charge-store';

/**
 * Poll whether a dynamic PIX charge (CorpX txid) was paid via webhook settlement.
 */
export async function GET(request: Request) {
  const txid = new URL(request.url).searchParams.get('txid')?.trim();
  if (!txid) {
    return NextResponse.json({ error: 'txid is required' }, { status: 400 });
  }

  const charge = await findDepositChargeByTxid(txid);
  if (!charge) {
    return NextResponse.json({ status: 'unknown' }, { status: 404 });
  }

  return NextResponse.json({
    status: charge.status,
    amountBrl: charge.amount_brl,
    paidAt: charge.paid_at,
    endToEndId: charge.end_to_end_id,
  });
}
