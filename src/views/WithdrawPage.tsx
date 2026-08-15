'use client';

import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { submitWithdrawPixAction, type SubmitWithdrawPixResult } from '@/app/actions/withdraw-pix';
import { useAuth } from '@/hooks/useAuth';
import { useBrhBalance } from '@/hooks/useBrhBalance';
import { useBrhRampAccess } from '@/hooks/useRampAvailability';
import { formatBrhAmount, formatBrlApprox } from '@/lib/format/brh-display';
import { parsePixEmv } from '@/lib/pix/emv-parser';
import { CameraIcon } from '../components/Icons';
import { Button } from '../components/ui/Button';
import { InputField } from '../components/ui/InputField';
import { useI18n } from '@/lib/i18n';

export function WithdrawPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthorized } = useAuth();
  const { canAccess } = useBrhRampAccess();
  const localeCode = locale === 'pt' ? 'pt-BR' : 'en-US';
  const { balanceNumber, isLoading: isBrhBalanceLoading, refetch } = useBrhBalance();
  const [paymentQrCode, setPaymentQrCode] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [amountFromQr, setAmountFromQr] = useState(false);
  const [beneficiaryPreview, setBeneficiaryPreview] = useState<string | null>(null);
  const [qrParseHint, setQrParseHint] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const parsedQr = useMemo(() => {
    const trimmed = paymentQrCode.trim();
    if (!trimmed) return null;
    return parsePixEmv(trimmed);
  }, [paymentQrCode]);

  useEffect(() => {
    if (!paymentQrCode.trim()) {
      setQrParseHint(null);
      setBeneficiaryPreview(null);
      setAmountFromQr(false);
      return;
    }

    if (!parsedQr?.ok) {
      setQrParseHint(parsedQr?.error ?? null);
      setBeneficiaryPreview(null);
      return;
    }

    setQrParseHint(null);
    setBeneficiaryPreview(parsedQr.data.merchantName);

    if (parsedQr.data.amountBrl) {
      setWithdrawAmount(parsedQr.data.amountBrl.replace('.', locale === 'pt' ? ',' : '.'));
      setAmountFromQr(true);
    }
  }, [paymentQrCode, parsedQr, locale]);

  const isSubmitDisabled =
    !paymentQrCode.trim() || !withdrawAmount.trim() || isLoading || parsedQr?.ok === false;

  function resolveActionError(result: Extract<SubmitWithdrawPixResult, { ok: false }>): string {
    const detail = result.message?.trim();

    switch (result.code) {
      case 'QR_REQUIRED':
        return t('pages.withdraw.errors.qrRequired');
      case 'INVALID_QR':
        return detail || t('pages.withdraw.errors.invalidQr');
      case 'AMOUNT_REQUIRED':
        return t('pages.withdraw.errors.amountRequired');
      case 'INVALID_AMOUNT':
        return detail || t('pages.withdraw.errors.invalidAmount');
      case 'AMOUNT_NOT_POSITIVE':
        return t('pages.withdraw.errors.amountNotPositive');
      case 'EXCEEDS_MAX_WITHDRAW': {
        const maxNum = Number(result.maxWithdrawBrl);
        const limitLabel = Number.isFinite(maxNum)
          ? formatBrlApprox(maxNum, localeCode)
          : (result.maxWithdrawBrl ?? '');
        return t('pages.withdraw.errors.exceedsMaxWithdraw').replace('{{limit}}', limitLabel);
      }
      case 'INSUFFICIENT_BRH':
        return detail || t('pages.withdraw.errors.insufficientBrh');
      case 'RAMP_DISABLED':
        return t('pages.settings.rampDisabled');
      default:
        return detail || t('pages.withdraw.errors.fallback');
    }
  }

  function resolveSuccessMessage(result: Extract<SubmitWithdrawPixResult, { ok: true }>): string {
    if (result.stage === 'completed') {
      const parts = [
        t('pages.withdraw.success.completed').replace(
          '{{amount}}',
          formatBrlApprox(Number(result.amountBrl), localeCode),
        ),
      ];
      if (result.e2eId) {
        parts.push(t('pages.withdraw.success.e2e').replace('{{e2e}}', result.e2eId));
      }
      if (result.offrampSkipped) {
        parts.push(t('pages.withdraw.success.offrampSkipped'));
      }
      return parts.join(' ');
    }

    return result.message?.trim() || t('pages.withdraw.success.validated');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const result = await submitWithdrawPixAction({
        paymentQrCode,
        withdrawAmount,
        actor: {
          email: user?.email ?? null,
          userId: user?.id ?? null,
        },
      });

      if (!result.ok) {
        setErrorMessage(resolveActionError(result));
        return;
      }

      setSuccessMessage(resolveSuccessMessage(result));
      void refetch();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading || !isAuthorized) return;
    if (!canAccess) {
      router.replace('/app/dashboard');
    }
  }, [authLoading, canAccess, isAuthorized, router]);

  if (authLoading || !canAccess) {
    return (
      <section className="dashboard-layout">
        <article className="surface">
          <p className="surface__lead">{t('pages.settings.loading')}</p>
        </article>
      </section>
    );
  }

  return (
    <section className="withdraw-layout">
      <article className="surface withdraw-form-card">
        <div className="deposit-form-card__header">
          <div>
            <p className="eyebrow">{t('pages.withdraw.eyebrow')}</p>
          </div>

          <aside className="brh-balance-card" aria-label={t('pages.withdraw.brhBalance')}>
            <span className="brh-balance-card__label">{t('pages.withdraw.brhBalance')}</span>
            <strong>
              {isBrhBalanceLoading
                ? '…'
                : `${formatBrhAmount(balanceNumber, localeCode)} BRH`}
            </strong>
          </aside>
        </div>

        {errorMessage ? (
          <p className="auth-inline-error deposit-form__alert" role="alert">
            {errorMessage}
          </p>
        ) : null}

        {successMessage ? (
          <p className="form-success-message deposit-form__alert" role="status">
            {successMessage}
          </p>
        ) : null}

        <form className="withdraw-form" onSubmit={handleSubmit}>
          <div className="withdraw-form__fields">
            <div className="withdraw-qr-row">
              <InputField
                id="payment-qr-code"
                label={t('pages.withdraw.paymentQrCode')}
                type="text"
                value={paymentQrCode}
                onChange={(event) => setPaymentQrCode(event.target.value)}
                placeholder={t('pages.withdraw.paymentQrCodePlaceholder')}
                autoComplete="off"
                required
              />

              <button
                type="button"
                className="icon-button withdraw-scan-button"
                aria-label={t('pages.withdraw.cameraButton')}
                title={t('pages.withdraw.cameraButton')}
                disabled
              >
                <CameraIcon width={18} height={18} />
              </button>
            </div>

            {beneficiaryPreview ? (
              <p className="withdraw-preview-line">
                {t('pages.withdraw.beneficiary')}: <strong>{beneficiaryPreview}</strong>
              </p>
            ) : null}

            {qrParseHint ? (
              <p className="auth-inline-error" role="alert">
                {qrParseHint}
              </p>
            ) : null}

            <InputField
              id="withdraw-amount"
              label={t('pages.withdraw.withdrawAmount')}
              type="text"
              inputMode="decimal"
              value={withdrawAmount}
              onChange={(event) => {
                setAmountFromQr(false);
                setWithdrawAmount(event.target.value);
              }}
              placeholder={t('pages.withdraw.withdrawAmountPlaceholder')}
              required
            />

            <p className="withdraw-amount-hint">
              {amountFromQr ? t('pages.withdraw.amountFromQrHint') : t('pages.withdraw.amountManualHint')}
            </p>

            <Button type="submit" className="deposit-form__button" disabled={isSubmitDisabled}>
              {isLoading ? t('pages.withdraw.submitLoading') : t('pages.withdraw.submit')}
            </Button>
          </div>
        </form>
      </article>
    </section>
  );
}
