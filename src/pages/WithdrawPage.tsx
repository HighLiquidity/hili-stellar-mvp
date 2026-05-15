import { useState } from 'react';
import { CameraIcon } from '../components/Icons';
import { Button } from '../components/ui/Button';
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
            <InputField
              id="payment-qr-code"
              label={t('pages.withdraw.paymentQrCode')}
              type="text"
              value={paymentQrCode}
              onChange={(event) => setPaymentQrCode(event.target.value)}
              placeholder={t('pages.withdraw.paymentQrCodePlaceholder')}
              autoComplete="off"
            />

            <div className="withdraw-camera-block">
              <span className="field__label">{t('pages.withdraw.cameraPlaceholderLabel')}</span>
              <Button type="button" variant="secondary" className="withdraw-camera-button">
                <CameraIcon width={20} height={20} />
                <span>{t('pages.withdraw.cameraButton')}</span>
              </Button>
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

          <p className="withdraw-form__hint">{t('pages.withdraw.autoFillHint')}</p>
        </form>
      </article>
    </section>
  );
}
