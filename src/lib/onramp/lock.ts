import '@/lib/server/only';



import QRCode from 'qrcode';



import { createCorpXAdapterFromEnv } from '@/lib/corpx/adapter';

import { registerPendingDepositCharge } from '@/lib/deposit/charge-store';

import { formatDepositPixErrorMessage } from '@/lib/deposit/format-pix-error';



import { OnrampOperationError } from './errors';

import { ONRAMP_FAILURE_CODES, buildOnrampFailurePatch } from './failure-codes';

import {

  findOnrampOrderById,

  lockQuotedOnrampOrderWithPix,

  markOnrampOrderStatus,

  type OnrampOrderRow,

} from './order-store';

import {
  buildOnrampPixCorrelationId,
  buildOnrampPixIdempotencyKey,
} from '@/lib/corpx/pix/identifier';

import {

  hasMinimumQuoteTimeToLock,

  resolveOnrampPixExpiresAt,

} from './ttl';

export { buildOnrampPixCorrelationId, buildOnrampPixIdempotencyKey } from '@/lib/corpx/pix/identifier';



export type OnrampLockResponse = {

  orderId: string;

  status: 'awaiting_pix';

  quote: {

    symbol: string;

    side: 'BUY' | 'SELL';

    amountBrl: string;

    amountUsdc: string;

    rate: string;

    expiresAt: string;

  };

  pix: {

    txid: string;

    copyPaste: string;

    qrDataUrl: string;

    expiresAt: string | null;

  };

  destination: {

    address: string;

    memo: string | null;

  };

};



export function isOnrampQuoteExpired(expiresAt: string, now = new Date()): boolean {

  const expiresAtMs = Date.parse(expiresAt);

  if (!Number.isFinite(expiresAtMs)) {

    throw new OnrampOperationError('On-ramp order has an invalid quote expiration timestamp.');

  }



  return expiresAtMs <= now.getTime();

}





async function toQrDataUrl(copyPaste: string): Promise<string> {

  return QRCode.toDataURL(copyPaste, {

    width: 280,

    margin: 2,

    errorCorrectionLevel: 'M',

  });

}



async function buildOnrampLockResponse(row: OnrampOrderRow): Promise<OnrampLockResponse> {

  if (!row.corpx_txid || !row.pix_copy_paste) {

    throw new OnrampOperationError('Locked on-ramp order is missing PIX payload data.');

  }



  return {

    orderId: row.id,

    status: 'awaiting_pix',

    quote: {

      symbol: row.quote_symbol,

      side: row.quote_side,

      amountBrl: row.amount_brl,

      amountUsdc: row.amount_usdc,

      rate: row.quote_rate ?? '',

      expiresAt: row.quote_expires_at,

    },

    pix: {

      txid: row.corpx_txid,

      copyPaste: row.pix_copy_paste,

      qrDataUrl: await toQrDataUrl(row.pix_copy_paste),

      expiresAt: row.corpx_expires_at,

    },

    destination: {

      address: row.destination_address,

      memo: row.destination_memo,

    },

  };

}



export async function lockOnrampOrderWithPix(orderId: string): Promise<OnrampLockResponse> {

  const normalizedOrderId = orderId.trim();

  if (!normalizedOrderId) {

    throw new OnrampOperationError('On-ramp order id is required.', 400);

  }



  const existing = await findOnrampOrderById(normalizedOrderId);

  if (!existing) {

    throw new OnrampOperationError('On-ramp order not found.', 404);

  }



  if (existing.status === 'awaiting_pix') {

    return buildOnrampLockResponse(existing);

  }



  if (existing.status !== 'quoted') {

    throw new OnrampOperationError(

      `On-ramp order cannot be locked from status "${existing.status}".`,

      409,

    );

  }



  if (isOnrampQuoteExpired(existing.quote_expires_at)) {

    await markOnrampOrderStatus({

      orderId: existing.id,

      status: 'expired',

      expectedStatus: 'quoted',

      patch: buildOnrampFailurePatch({

        code: ONRAMP_FAILURE_CODES.QUOTE_EXPIRED,

        reason: 'On-ramp quote has expired.',

        needsReview: false,

      }),

    });



    throw new OnrampOperationError('On-ramp quote has expired.', 409);

  }



  if (!hasMinimumQuoteTimeToLock(existing.quote_expires_at)) {

    throw new OnrampOperationError(

      'Insufficient quote time remaining. Request a new quote before locking.',

      409,

    );

  }



  const correlationId = buildOnrampPixCorrelationId(existing.id);

  const idempotencyKey = buildOnrampPixIdempotencyKey(existing.id);

  const pixExpiresAt = resolveOnrampPixExpiresAt(existing.quote_expires_at);



  let pix: Awaited<ReturnType<Awaited<ReturnType<typeof createCorpXAdapterFromEnv>>['pix']['generateDynamicPIX']>>;

  try {

    const adapter = await createCorpXAdapterFromEnv();

    pix = await adapter.pix.generateDynamicPIX({

      idempotencyKey,

      correlationId,

      amount: existing.amount_brl,

      expiresAt: pixExpiresAt,

      description: `On-ramp order ${existing.id}`,

    });

  } catch (error) {

    throw new OnrampOperationError(`Failed to create PIX charge: ${formatDepositPixErrorMessage(error)}`, 502);

  }



  await registerPendingDepositCharge({

    corpxTxid: pix.providerTxId,

    amountBrl: existing.amount_brl,

    taxId: existing.tax_id,

    identifier: correlationId,

  });



  const locked = await lockQuotedOnrampOrderWithPix({

    orderId: existing.id,

    corpxTxid: pix.providerTxId,

    corpxIdentifier: correlationId,

    corpxExpiresAt: pix.expiresAt,

    pixCopyPaste: pix.qrCode,

  });



  if (!locked.ok) {

    const latest = await findOnrampOrderById(existing.id);

    if (latest?.status === 'awaiting_pix') {

      return buildOnrampLockResponse(latest);

    }



    throw new OnrampOperationError(`Failed to lock on-ramp order: ${locked.reason}`, 409);

  }



  return buildOnrampLockResponse(locked.row);

}

