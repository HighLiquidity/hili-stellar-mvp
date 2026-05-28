'use server';

import { randomUUID } from 'node:crypto';

import QRCode from 'qrcode';

import {
  isDepositAboveMax,
  loadMaxDepositBrl,
  parseMaxDepositBrl,
} from '@/lib/admin-test-settings/deposit-limits';
import { createCorpXAdapterFromEnv } from '@/lib/corpx/adapter';
import { brlStringToJsonNumber } from '@/lib/corpx/pix/brl';
import { clampCorpXPixExpirationDate } from '@/lib/corpx/pix/expiration';
import { registerPendingDepositCharge } from '@/lib/deposit/charge-store';
import { formatDepositPixErrorMessage } from '@/lib/deposit/format-pix-error';
import { logFiatDepositQrAttempt } from '@/lib/fiat-operations/log-deposit';
import type { FiatOperationActor } from '@/lib/fiat-operations/types';

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
  actor?: FiatOperationActor;
}): Promise<GenerateDepositPixResult> {
  let result: GenerateDepositPixResult | undefined;
  let amountBrlForLog: string | null = null;

  try {
    if (!input.taxId.trim()) {
      result = { ok: false, code: 'TAX_ID_REQUIRED' };
      return result;
    }

    const normalizedAmount = input.amount.trim().replace(',', '.');

    let amountNum: number;
    try {
      amountNum = brlStringToJsonNumber(normalizedAmount);
    } catch {
      result = { ok: false, code: 'INVALID_AMOUNT' };
      return result;
    }

    if (amountNum <= 0) {
      result = { ok: false, code: 'AMOUNT_NOT_POSITIVE' };
      return result;
    }

    amountBrlForLog = amountNum.toFixed(2);

    const maxDepositLoad = await loadMaxDepositBrl();
    if (!maxDepositLoad.ok) {
      result = { ok: false, code: 'SETTINGS_UNAVAILABLE', message: maxDepositLoad.reason };
      return result;
    }

    const maxDepositNum = parseMaxDepositBrl(maxDepositLoad.maxDepositBrl);
    if (maxDepositNum === null) {
      const message = `Limite de depósito inválido nas configurações: "${maxDepositLoad.maxDepositBrl}"`;
      console.error('[generateDepositPixAction]', message);
      result = { ok: false, code: 'SETTINGS_UNAVAILABLE', message };
      return result;
    }

    if (isDepositAboveMax(amountNum, maxDepositNum)) {
      result = {
        ok: false,
        code: 'EXCEEDS_MAX_DEPOSIT',
        maxDepositBrl: maxDepositNum.toFixed(2),
      };
      return result;
    }

    const amount = amountBrlForLog;

    try {
      const adapter = await createCorpXAdapterFromEnv();
      const correlationId = randomUUID();
      const pix = await adapter.pix.generateDynamicPIX({
        idempotencyKey: randomUUID(),
        correlationId,
        amount,
        expiresAt: clampCorpXPixExpirationDate(new Date(Date.now() + PIX_CHARGE_TTL_MS)),
        description: 'Fiat deposit',
      });

      const qrDataUrl = await QRCode.toDataURL(pix.qrCode, {
        width: 280,
        margin: 2,
        errorCorrectionLevel: 'M',
      });

      await registerPendingDepositCharge({
        corpxTxid: pix.providerTxId,
        amountBrl: amount,
        taxId: input.taxId,
        identifier: correlationId,
      });

      result = {
        ok: true,
        qrDataUrl,
        pixCopyPaste: pix.qrCode,
        providerTxId: pix.providerTxId,
        expiresAt: pix.expiresAt,
      };
      return result;
    } catch (e) {
      const message = formatDepositPixErrorMessage(e);
      console.error('[generateDepositPixAction]', message, e);
      result = { ok: false, code: 'UPSTREAM', message };
      return result;
    }
  } finally {
    if (result) {
      await logFiatDepositQrAttempt({
        taxId: input.taxId,
        amountInput: input.amount,
        amountBrl: amountBrlForLog,
        actor: input.actor,
        result,
      });
    }
  }
}
