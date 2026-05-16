'use server';

import { randomUUID } from 'node:crypto';

import QRCode from 'qrcode';

import {
  isDepositAboveMax,
  loadMaxDepositBrl,
  parseMaxDepositBrl,
} from '@/lib/admin-test-settings/deposit-limits';
import { createCorpXAdapterFromEnv } from '@/lib/corpx/adapter';
import { formatDepositPixErrorMessage } from '@/lib/deposit/format-pix-error';
import { brlStringToJsonNumber } from '@/lib/corpx/pix/brl';

export type GenerateDepositPixResult =
  | {
      ok: true;
      qrDataUrl: string;
      pixCopyPaste: string;
      providerTxId: string;
      expiresAt: string | null;
    }
  | {
      ok: false;
      code:
        | 'TAX_ID_REQUIRED'
        | 'INVALID_AMOUNT'
        | 'AMOUNT_NOT_POSITIVE'
        | 'EXCEEDS_MAX_DEPOSIT'
        | 'SETTINGS_UNAVAILABLE'
        | 'UPSTREAM';
      maxDepositBrl?: string;
      message?: string;
    };

const PIX_CHARGE_TTL_MS = 24 * 60 * 60 * 1000;

export async function generateDepositPixAction(input: {
  taxId: string;
  amount: string;
}): Promise<GenerateDepositPixResult> {
  if (!input.taxId.trim()) {
    return { ok: false, code: 'TAX_ID_REQUIRED' };
  }

  const normalizedAmount = input.amount.trim().replace(',', '.');

  let amountNum: number;
  try {
    amountNum = brlStringToJsonNumber(normalizedAmount);
  } catch {
    return { ok: false, code: 'INVALID_AMOUNT' };
  }

  if (amountNum <= 0) {
    return { ok: false, code: 'AMOUNT_NOT_POSITIVE' };
  }

  const maxDepositLoad = await loadMaxDepositBrl();
  if (!maxDepositLoad.ok) {
    return { ok: false, code: 'SETTINGS_UNAVAILABLE', message: maxDepositLoad.reason };
  }

  const maxDepositNum = parseMaxDepositBrl(maxDepositLoad.maxDepositBrl);
  if (maxDepositNum === null) {
    const message = `Limite de depósito inválido nas configurações: "${maxDepositLoad.maxDepositBrl}"`;
    console.error('[generateDepositPixAction]', message);
    return { ok: false, code: 'SETTINGS_UNAVAILABLE', message };
  }

  if (isDepositAboveMax(amountNum, maxDepositNum)) {
    return {
      ok: false,
      code: 'EXCEEDS_MAX_DEPOSIT',
      maxDepositBrl: maxDepositNum.toFixed(2),
    };
  }

  const amount = amountNum.toFixed(2);

  try {
    const adapter = await createCorpXAdapterFromEnv();
    const pix = await adapter.pix.generateDynamicPIX({
      idempotencyKey: randomUUID(),
      correlationId: randomUUID(),
      amount,
      expiresAt: new Date(Date.now() + PIX_CHARGE_TTL_MS),
      description: 'Fiat deposit',
    });

    const qrDataUrl = await QRCode.toDataURL(pix.qrCode, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: 'M',
    });

    return {
      ok: true,
      qrDataUrl,
      pixCopyPaste: pix.qrCode,
      providerTxId: pix.providerTxId,
      expiresAt: pix.expiresAt,
    };
  } catch (e) {
    const message = formatDepositPixErrorMessage(e);
    console.error('[generateDepositPixAction]', message, e);
    return { ok: false, code: 'UPSTREAM', message };
  }
}
