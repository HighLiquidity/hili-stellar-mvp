'use client';

import { useState } from 'react';
import { CameraIcon } from '../components/Icons';
import { InputField } from '../components/ui/InputField';
import { useI18n } from '../lib/i18n';

export function WithdrawPage() {
  const { t } = useI18n();
  const [paymentQrCode, setPaymentQrCode] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');

  return (
    <section className="withdraw-layout">
      <article className="surface withdraw-form-card">
        <div>
          <p className="eyebrow">{t('pages.withdraw.eyebrow')}</p>
          <h2>{t('pages.withdraw.title')}</h2>
          <p className="surface__lead">{t('pages.withdraw.description')}</p>
        </div>

        <form className="withdraw-form" onSubmit={(event) => event.preventDefault()}>
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

            <InputField
              id="withdraw-amount"
              label={t('pages.withdraw.withdrawAmount')}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={withdrawAmount}

              onChange={(event) => setWithdrawAmount(event.target.value)}
              placeholder={t('pages.withdraw.withdrawAmountPlaceholder')}
              required
            />
          </div>

        </form>
      </article>
    </section>
  );
}
