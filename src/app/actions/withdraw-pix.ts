'use server';

import { randomUUID } from 'node:crypto';

import {
  isWithdrawAboveMax,
  loadMaxWithdrawBrl,
  parseMaxWithdrawBrl,
} from '@/lib/admin-test-settings/withdraw-limits';
import {
  decrementBrhBalance,
  hasSufficientBrhBalance,
  readBrhBalanceAdmin,
} from '@/lib/brh/balance-store';
import { triggerBrhBurnRequest } from '@/lib/brh/burn';
import { createCorpXAdapterFromEnv } from '@/lib/corpx/adapter';
import { brlStringToJsonNumber } from '@/lib/corpx/pix/brl';
import { formatDepositPixErrorMessage } from '@/lib/deposit/format-pix-error';
import { logFiatWithdrawAttempt } from '@/lib/fiat-operations/log-withdraw';
import type { FiatOperationActor } from '@/lib/fiat-operations/types';
import { parsePixEmv } from '@/lib/pix/emv-parser';

export type SubmitWithdrawPixResult =
  | {
      ok: true;
      stage: 'completed' | 'validated';
      amountBrl: string;
      beneficiaryName?: string | null;
      providerTxId?: string;
      e2eId?: string;
      cashOutStatus?: string;
      burnSkipped?: boolean;
      corpxSkipped?: boolean;
      message?: string;
    }
  | {
      ok: false;
      code:
        | 'QR_REQUIRED'
        | 'INVALID_QR'
        | 'AMOUNT_REQUIRED'
        | 'INVALID_AMOUNT'
        | 'AMOUNT_NOT_POSITIVE'
        | 'EXCEEDS_MAX_WITHDRAW'
        | 'INSUFFICIENT_BRH'
        | 'SETTINGS_UNAVAILABLE'
        | 'BURN_FAILED'
        | 'UPSTREAM';
      maxWithdrawBrl?: string;
      message?: string;
    };

function shortCorrelationId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 32);
}

function resolveAmountBrl(emvAmount: string | null, inputAmount: string): { ok: true; amount: string } | { ok: false; code: 'AMOUNT_REQUIRED' | 'INVALID_AMOUNT' | 'AMOUNT_NOT_POSITIVE' } {
  const normalizedInput = inputAmount.trim().replace(',', '.');

  let amountNum: number | null = null;

  if (normalizedInput) {
    try {
      amountNum = brlStringToJsonNumber(normalizedInput);
    } catch {
      return { ok: false, code: 'INVALID_AMOUNT' };
    }
  } else if (emvAmount) {
    try {
      amountNum = brlStringToJsonNumber(emvAmount);
    } catch {
      return { ok: false, code: 'INVALID_AMOUNT' };
    }
  } else {
    return { ok: false, code: 'AMOUNT_REQUIRED' };
  }

  if (amountNum <= 0) {
    return { ok: false, code: 'AMOUNT_NOT_POSITIVE' };
  }

  return { ok: true, amount: amountNum.toFixed(2) };
}

export async function submitWithdrawPixAction(input: {
  paymentQrCode: string;
  withdrawAmount: string;
  actor?: FiatOperationActor;
}): Promise<SubmitWithdrawPixResult> {
  let result: SubmitWithdrawPixResult | undefined;
  let amountBrlForLog: string | null = null;
  let beneficiaryNameForLog: string | null = null;
  let brhBalanceBefore: string | null = null;
  let idempotencyKeyForLog: string | null = null;

  try {
    const emv = input.paymentQrCode.trim();
    if (!emv) {
      result = { ok: false, code: 'QR_REQUIRED' };
      return result;
    }

    const parsedEmv = parsePixEmv(emv);
    if (!parsedEmv.ok) {
      result = { ok: false, code: 'INVALID_QR', message: parsedEmv.error };
      return result;
    }

    beneficiaryNameForLog = parsedEmv.data.merchantName;

    const amountResolved = resolveAmountBrl(parsedEmv.data.amountBrl, input.withdrawAmount);
    if (!amountResolved.ok) {
      result = { ok: false, code: amountResolved.code };
      return result;
    }

    const amountBrl = amountResolved.amount;
    amountBrlForLog = amountBrl;

    const maxWithdrawLoad = await loadMaxWithdrawBrl();
    if (!maxWithdrawLoad.ok) {
      result = { ok: false, code: 'SETTINGS_UNAVAILABLE', message: maxWithdrawLoad.reason };
      return result;
    }

    const maxWithdrawNum = parseMaxWithdrawBrl(maxWithdrawLoad.maxWithdrawBrl);
    if (maxWithdrawNum === null) {
      const message = `Limite de saque inválido nas configurações: "${maxWithdrawLoad.maxWithdrawBrl}"`;
      result = { ok: false, code: 'SETTINGS_UNAVAILABLE', message };
      return result;
    }

    const amountNum = brlStringToJsonNumber(amountBrl);
    if (isWithdrawAboveMax(amountNum, maxWithdrawNum)) {
      result = {
        ok: false,
        code: 'EXCEEDS_MAX_WITHDRAW',
        maxWithdrawBrl: maxWithdrawNum.toFixed(2),
      };
      return result;
    }

    brhBalanceBefore = await readBrhBalanceAdmin();
    if (!hasSufficientBrhBalance(brhBalanceBefore, amountNum)) {
      result = {
        ok: false,
        code: 'INSUFFICIENT_BRH',
        message: `Saldo BRH insuficiente. Disponível: ${brhBalanceBefore} BRH; solicitado: ${amountBrl} BRL.`,
      };
      return result;
    }

    const idempotencyKey = shortCorrelationId();
    idempotencyKeyForLog = idempotencyKey;

    const burnResult = await triggerBrhBurnRequest({
      amount: amountBrl,
      idempotencyKey,
      source: 'fiat_withdraw_pix',
      emv,
    });

    if (!burnResult.ok && !burnResult.skipped) {
      result = { ok: false, code: 'BURN_FAILED', message: burnResult.message };
      return result;
    }

    const burnSkipped = !burnResult.ok && burnResult.skipped;

    let beneficiaryName = parsedEmv.data.merchantName;

    try {
      const adapter = await createCorpXAdapterFromEnv();

      try {
        const decoded = await adapter.pix.decodePaymentQrEmv(emv);
        if (decoded.beneficiaryName) beneficiaryName = decoded.beneficiaryName;
      } catch (e) {
        console.warn('[submitWithdrawPixAction] CorpX QR decode failed, using local parse', e);
      }

      beneficiaryNameForLog = beneficiaryName;

      const payout = await adapter.pix.payPaymentQrEmv({
        emv,
        amount: amountBrl,
        description: 'Fiat withdrawal',
        idempotencyKey,
        correlationId: shortCorrelationId(),
      });

      const decremented = await decrementBrhBalance(amountBrl);
      if (!decremented.ok) {
        console.warn('[submitWithdrawPixAction] BRH balance decrement failed after CorpX payout');
      }

      result = {
        ok: true,
        stage: 'completed',
        amountBrl,
        beneficiaryName,
        providerTxId: payout.providerTxId,
        e2eId: payout.e2eId,
        cashOutStatus: payout.status,
        burnSkipped,
      };
      return result;
    } catch (e) {
      const corpMessage = formatDepositPixErrorMessage(e);
      const missingCorpX =
        /corpx adapter requires|CORPX_CLIENT_ID|CORPX_ACCOUNT_ID|CORPX_PIX_KEY/i.test(corpMessage);

      if (missingCorpX) {
        result = {
          ok: true,
          stage: 'validated',
          amountBrl,
          beneficiaryName,
          burnSkipped,
          corpxSkipped: true,
          message: [
            burnSkipped ? 'Burn BRH: configure BRH_BURN_API_URL (smart contract pendente).' : null,
            'Cash out CorpX: configure as variáveis CORPX_* para executar o PIX.',
          ]
            .filter(Boolean)
            .join(' '),
        };
        return result;
      }

      console.error('[submitWithdrawPixAction]', corpMessage, e);
      result = { ok: false, code: 'UPSTREAM', message: corpMessage };
      return result;
    }
  } finally {
    if (result) {
      await logFiatWithdrawAttempt({
        paymentQrCode: input.paymentQrCode,
        amountInput: input.withdrawAmount,
        amountBrl: amountBrlForLog,
        beneficiaryName: beneficiaryNameForLog,
        brhBalanceBefore,
        actor: input.actor,
        result,
        idempotencyKey: idempotencyKeyForLog,
      });
    }
  }
}
