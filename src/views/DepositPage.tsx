'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';

import { generateDepositPixAction, type GenerateDepositPixResult } from '@/app/actions/deposit-pix';
import { useAuth } from '@/hooks/useAuth';
import { useBrhBalance } from '@/hooks/useBrhBalance';
import { formatBrhAmount, formatBrlApprox } from '@/lib/format/brh-display';
import { Button } from '../components/ui/Button';
import { InputField } from '../components/ui/InputField';
import { useI18n } from '@/lib/i18n';

export function DepositPage() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const localeCode = locale === 'pt' ? 'pt-BR' : 'en-US';
  const { balanceNumber, isLoading: isBrhBalanceLoading, refetch: refetchBrhBalance } = useBrhBalance();
  const [taxId, setTaxId] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [isPixCodeCopied, setIsPixCodeCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [pixCopyPaste, setPixCopyPaste] = useState<string | null>(null);
  const [activeChargeTxid, setActiveChargeTxid] = useState<string | null>(null);
  const [chargePaid, setChargePaid] = useState(false);

  const isGenerateDisabled =
    !taxId.trim() || !depositAmount.trim() || isLoading;

  useEffect(() => {
    setIsPixCodeCopied(false);
  }, [pixCopyPaste]);

  useEffect(() => {
    if (!activeChargeTxid || chargePaid) return;

    let cancelled = false;

    async function pollChargeStatus() {
      const txid = activeChargeTxid;
      if (!txid) return;
      try {
        const res = await fetch(
          `/api/deposit/charge-status?txid=${encodeURIComponent(txid)}`,
          { cache: 'no-store' },
        );
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { status?: string };
        if (json.status === 'paid') {
          setChargePaid(true);
          void refetchBrhBalance();
        }
      } catch {
        /* polling is best-effort */
      }
    }

    void pollChargeStatus();
    const interval = window.setInterval(() => void pollChargeStatus(), 4000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeChargeTxid, chargePaid, refetchBrhBalance]);

  function resolveActionError(result: Extract<GenerateDepositPixResult, { ok: false }>): string {
    const detail = result.message?.trim();

    switch (result.code) {
      case 'TAX_ID_REQUIRED':
        return t('pages.deposit.errors.taxIdRequired');
      case 'INVALID_AMOUNT':
        return t('pages.deposit.errors.invalidAmount');
      case 'AMOUNT_NOT_POSITIVE':
        return t('pages.deposit.errors.amountNotPositive');
      case 'EXCEEDS_MAX_DEPOSIT': {
        const maxNum = Number(result.maxDepositBrl);
        const limitLabel = Number.isFinite(maxNum)
          ? formatBrlApprox(maxNum, localeCode)
          : (result.maxDepositBrl ?? '');
        return t('pages.deposit.errors.exceedsMaxDeposit').replace('{{limit}}', limitLabel);
      }
      default:
        return detail || t('pages.deposit.errors.fallback');
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);
    setQrDataUrl(null);
    setPixCopyPaste(null);

    try {
      const result = await generateDepositPixAction({
        taxId,
        amount: depositAmount,
        actor: {
          email: user?.email ?? null,
          userId: user?.id ?? null,
        },
      });

      if (!result.ok) {
        setErrorMessage(resolveActionError(result));
        return;
      }

      setQrDataUrl(result.qrDataUrl);
      setPixCopyPaste(result.pixCopyPaste);
      setActiveChargeTxid(result.providerTxId);
      setChargePaid(false);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCopyPixCode() {
    if (!pixCopyPaste?.trim()) return;
    try {
      await navigator.clipboard.writeText(pixCopyPaste);
      setIsPixCodeCopied(true);
    } catch {
      setErrorMessage(t('pages.deposit.errors.copyFailed'));
    }
  }

  const hasPayload = Boolean(qrDataUrl && pixCopyPaste);

  return (
    <section className="deposit-layout">
      <article className="surface deposit-form-card">
        <div className="deposit-form-card__header">
          <div>
            <p className="eyebrow">{t('pages.deposit.eyebrow')}</p>
            <h2>{t('pages.deposit.title')}</h2>
          </div>

          <aside className="brh-balance-card" aria-label={t('pages.deposit.brhBalance')}>
            <span className="brh-balance-card__label">{t('pages.deposit.brhBalance')}</span>
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

        {chargePaid ? (
          <p className="form-success-message deposit-form__alert" role="status">
            {t('pages.deposit.paymentConfirmed')}
          </p>
        ) : activeChargeTxid && hasPayload ? (
          <p className="deposit-awaiting-payment" role="status">
            {t('pages.deposit.awaitingPayment')}
          </p>
        ) : null}

        <form className="deposit-form" onSubmit={handleSubmit}>
          <div className="deposit-form__fields">
            <InputField
              id="tax-id"
              label={t('pages.deposit.taxId')}
              type="text"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder={t('pages.deposit.taxIdPlaceholder')}
              autoComplete="off"
              required
            />

            <InputField
              id="deposit-amount"
              label={t('pages.deposit.depositAmount')}
              type="text"
              inputMode="decimal"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder={t('pages.deposit.depositAmountPlaceholder')}
              required
            />
          </div>

          <Button
            type="submit"
            className="deposit-form__button"
            disabled={isGenerateDisabled}
          >
            {isLoading ? t('pages.deposit.generateQrCodeLoading') : t('pages.deposit.generateQrCode')}
          </Button>
        </form>
      </article>

      <div className="deposit-output-grid">
        <article className="surface deposit-output-card">
          <div className="deposit-output-card__header">
            <h3>{t('pages.deposit.qrCodeTitle')}</h3>
            <span className="placeholder-badge">{t('pages.deposit.badge')}</span>
          </div>
          <div
            className={`deposit-qr-placeholder${hasPayload ? ' deposit-qr-placeholder--filled' : ''}`}
            aria-label={t('pages.deposit.qrCodeTitle')}
          >
            {qrDataUrl ? (
              /* Data URL from server action — not suitable for next/image */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt={t('pages.deposit.qrCodeTitle')}
                width={280}
                height={280}
                className="deposit-qr-image"
              />
            ) : (
              <span>{t('pages.deposit.qrCodePlaceholder')}</span>
            )}
          </div>
        </article>

        <article className="surface deposit-output-card">
          <div className="deposit-output-card__header">
            <h3>{t('pages.deposit.copyPasteTitle')}</h3>
          </div>
          <div
            className={`deposit-copy-placeholder${hasPayload ? ' deposit-copy-placeholder--filled' : ''}`}
            aria-label={t('pages.deposit.copyPasteTitle')}
          >
            {pixCopyPaste ? (
              <span className="deposit-copy-code">{pixCopyPaste}</span>
            ) : (
              <span className="deposit-copy-code deposit-copy-code--muted">
                {t('pages.deposit.copyPastePlaceholder')}
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="secondary"
            fullWidth
            onClick={handleCopyPixCode}
            disabled={!pixCopyPaste?.trim()}
          >
            {isPixCodeCopied ? t('pages.deposit.copyPasteCopied') : t('pages.deposit.copyPasteButton')}
          </Button>
        </article>
      </div>
    </section>
  );
}
