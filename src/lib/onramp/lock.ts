import '@/lib/server/only';



import QRCode from 'qrcode';



import { createCorpXAdapterFromEnv } from '@/lib/corpx/adapter';

import { registerPendingDepositCharge } from '@/lib/deposit/charge-store';

import { formatDepositPixErrorMessage } from '@/lib/deposit/format-pix-error';



import { isOnrampQuotePlaceholderDestination } from '@/lib/ramp/quote-placeholders';
import { assertOnrampOrderInDataScope, type DataScope } from '@/lib/clients/scope';
import type { PanelUserRole } from '@/lib/users/types';

import { OnrampOperationError } from './errors';
import { ONRAMP_FAILURE_CODES, buildOnrampFailurePatch } from './failure-codes';
import { resolveWhitelistedOnrampDestination } from './whitelist-lock';

import {

  findOnrampOrderById,

  lockQuotedOnrampOrderWithPix,

  markOnrampOrderStatus,

  updateOnrampOrder,

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

  externalId: string | null;

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

    externalId: row.integrator_external_id,

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



export type LockOnrampOrderInput = {
  orderId: string;
  actor: {
    userId: string;
    role: PanelUserRole;
    dataScope?: DataScope | null;
  };
  destinationAddress?: string;
};

export async function lockOnrampOrderWithPix(input: LockOnrampOrderInput): Promise<OnrampLockResponse> {
  const normalizedOrderId = input.orderId.trim();

  if (!normalizedOrderId) {

    throw new OnrampOperationError('On-ramp order id is required.', 400);

  }



  const existing = await findOnrampOrderById(normalizedOrderId);

  if (!existing) {

    throw new OnrampOperationError('On-ramp order not found.', 404);

  }

  if (input.actor.dataScope !== undefined) {
    assertOnrampOrderInDataScope(existing, input.actor.dataScope, { userId: input.actor.userId });
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

  const requestedDestination = input.destinationAddress?.trim() || existing.destination_address;
  const whitelistedDestination = await resolveWhitelistedOnrampDestination({
    role: input.actor.role,
    userId: input.actor.userId,
    destinationAddress: requestedDestination,
  });

  let orderForLock = existing;
  const destinationChanged =
    orderForLock.destination_address !== whitelistedDestination.address ||
    orderForLock.destination_memo !== whitelistedDestination.memo ||
    isOnrampQuotePlaceholderDestination(orderForLock.destination_address);

  if (destinationChanged) {
    const updated = await updateOnrampOrder({
      orderId: existing.id,
      expectedStatus: 'quoted',
      patch: {
        destination_address: whitelistedDestination.address,
        destination_memo: whitelistedDestination.memo,
      },
    });

    if (!updated.ok) {
      throw new OnrampOperationError(`Failed to update on-ramp destination before lock: ${updated.reason}`, 409);
    }

    orderForLock = updated.row;
  }

  const correlationId = buildOnrampPixCorrelationId(orderForLock.id);

  const idempotencyKey = buildOnrampPixIdempotencyKey(orderForLock.id);

  const pixExpiresAt = resolveOnrampPixExpiresAt(orderForLock.quote_expires_at);



  let pix: Awaited<ReturnType<Awaited<ReturnType<typeof createCorpXAdapterFromEnv>>['pix']['generateDynamicPIX']>>;

  try {

    const adapter = await createCorpXAdapterFromEnv();

    pix = await adapter.pix.generateDynamicPIX({

      idempotencyKey,

      correlationId,

      amount: orderForLock.amount_brl,

      expiresAt: pixExpiresAt,

      description: `On-ramp order ${orderForLock.id}`,

    });

  } catch (error) {

    throw new OnrampOperationError(`Failed to create PIX charge: ${formatDepositPixErrorMessage(error)}`, 502);

  }



  await registerPendingDepositCharge({

    corpxTxid: pix.providerTxId,

    amountBrl: orderForLock.amount_brl,

    taxId: orderForLock.tax_id,

    identifier: correlationId,

  });



  const locked = await lockQuotedOnrampOrderWithPix({

    orderId: orderForLock.id,

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

