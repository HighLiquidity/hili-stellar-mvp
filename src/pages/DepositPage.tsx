import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { InputField } from '../components/ui/InputField';
import { useI18n } from '../lib/i18n';

export function DepositPage() {
  const { t } = useI18n();
  const [taxId, setTaxId] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const isGenerateDisabled = !taxId.trim() || !depositAmount.trim();

  return (
    <section className="deposit-layout">

      <article className="surface deposit-form-card">
        <div className="deposit-form-card__header">
          <div>
            <p className="eyebrow">{t('pages.deposit.eyebrow')}</p>
            <h2>{t('pages.deposit.title')}</h2>
            <p className="surface__lead">{t('pages.deposit.description')}</p>
          </div>

          <aside className="brh-balance-card" aria-label={t('pages.deposit.brhBalance')}>
            <span className="brh-balance-card__label">{t('pages.deposit.brhBalance')}</span>
            <strong>{t('pages.deposit.brhBalancePlaceholder')}</strong>
          </aside>
        </div>

        <form className="deposit-form" onSubmit={(event) => event.preventDefault()}>
          <div className="deposit-form__fields">
            <InputField
              id="tax-id"
              label={t('pages.deposit.taxId')}
              type="text"
              value={taxId}
              onChange={(event) => setTaxId(event.target.value)}
              placeholder={t('pages.deposit.taxIdPlaceholder')}
              autoComplete="off"
              required
            />

            <InputField
              id="deposit-amount"
              label={t('pages.deposit.depositAmount')}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={depositAmount}
              onChange={(event) => setDepositAmount(event.target.value)}
              placeholder={t('pages.deposit.depositAmountPlaceholder')}
              required
            />
          </div>

          <Button type="button" className="deposit-form__button" disabled={isGenerateDisabled}>
            {t('pages.deposit.generateQrCode')}
          </Button>
        </form>

      </article>

      <div className="deposit-output-grid">
        <article className="surface deposit-output-card">
          <div className="deposit-output-card__header">
            <h3>{t('pages.deposit.qrCodeTitle')}</h3>
            <span className="placeholder-badge">{t('pages.deposit.badge')}</span>
          </div>
          <div className="deposit-qr-placeholder" aria-label={t('pages.deposit.qrCodePlaceholder')}>
            <span>{t('pages.deposit.qrCodePlaceholder')}</span>
          </div>
        </article>

        <article className="surface deposit-output-card">
          <div className="deposit-output-card__header">
            <h3>{t('pages.deposit.copyPasteTitle')}</h3>
          </div>
          <div className="deposit-copy-placeholder" aria-label={t('pages.deposit.copyPastePlaceholder')}>
            <span>{t('pages.deposit.copyPastePlaceholder')}</span>
          </div>
        </article>
      </div>
    </section>
  );
}
