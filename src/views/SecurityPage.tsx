'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button } from '../components/ui/Button';
import { InputField } from '../components/ui/InputField';
import { useAuth } from '../hooks/useAuth';
import {
  disableVerifiedTotp,
  enrollTotpFactor,
  getAuthErrorMessage,
  getVerifiedTotpFactor,
  unenrollTotpFactor,
  verifyTotpEnrollment,
  type TotpEnrollment,
} from '../lib/authService';
import { useI18n } from '@/lib/i18n';

export function SecurityPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const userEmail = user?.email ?? '';

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const factor = await getVerifiedTotpFactor();
      setEnabled(Boolean(factor));
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
      setEnabled(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleStartEnroll = async () => {
    setIsBusy(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setCopied(false);
    try {
      const next = await enrollTotpFactor();
      setEnrollment(next);
      setCode('');
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleCancelEnroll = async () => {
    if (!enrollment) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    try {
      await unenrollTotpFactor(enrollment.factorId);
      setEnrollment(null);
      setCode('');
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleVerifyEnroll = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!enrollment) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await verifyTotpEnrollment(enrollment.factorId, code);
      setEnrollment(null);
      setCode('');
      setEnabled(true);
      setSuccessMessage(t('pages.security.successEnabled'));
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleDisable = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const confirmed = window.confirm(t('pages.security.confirmDisable'));
    if (!confirmed) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await disableVerifiedTotp(code);
      setCode('');
      setEnabled(false);
      setSuccessMessage(t('pages.security.successDisabled'));
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleCopySecret = async () => {
    if (!enrollment?.secret) {
      return;
    }

    try {
      await navigator.clipboard.writeText(enrollment.secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="page-grid page-grid--single password-page">
      <article className="surface password-page__card">
        <header className="password-page__header">
          <div>
            <p className="eyebrow">{t('pages.security.eyebrow')}</p>
            <h2>{t('pages.security.title')}</h2>
            <p className="surface__lead">{t('pages.security.description')}</p>
          </div>

          <aside className="password-page__account" aria-label={t('pages.changePassword.accountLabel')}>
            <span className="password-page__account-label">{t('pages.changePassword.accountLabel')}</span>
            <strong>{userEmail}</strong>
          </aside>
        </header>

        {isLoading ? (
          <p className="surface__lead">{t('pages.security.loading')}</p>
        ) : (
          <>
            <p className={`security-status${enabled ? ' is-on' : ' is-off'}`}>
              {enabled ? t('pages.security.statusOn') : t('pages.security.statusOff')}
            </p>

            {errorMessage ? <p className="auth-inline-error">{errorMessage}</p> : null}
            {successMessage ? <p className="form-success-message">{successMessage}</p> : null}

            {enrollment ? (
              <form className="password-form" onSubmit={handleVerifyEnroll}>
                <div className="security-qr">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={enrollment.qrCode} alt={t('pages.security.qrAlt')} width={180} height={180} />
                  <p className="field__hint">{t('pages.security.qrHint')}</p>
                  <p className="security-secret">{enrollment.secret}</p>
                  <Button type="button" variant="ghost" onClick={() => void handleCopySecret()}>
                    {copied ? t('pages.security.copied') : t('pages.security.copySecret')}
                  </Button>
                </div>

                <InputField
                  id="security-enroll-code"
                  label={t('auth.mfaCode')}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={8}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder={t('auth.mfaCodePlaceholder')}
                  required
                />

                <div className="password-page__actions security-actions">
                  <Button type="submit" disabled={isBusy}>
                    {isBusy ? t('pages.security.verifying') : t('pages.security.verify')}
                  </Button>
                  <Button type="button" variant="ghost" disabled={isBusy} onClick={() => void handleCancelEnroll()}>
                    {t('pages.security.cancelEnroll')}
                  </Button>
                </div>
              </form>
            ) : enabled ? (
              <form className="password-form" onSubmit={handleDisable}>
                <InputField
                  id="security-disable-code"
                  label={t('auth.mfaCode')}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={8}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder={t('auth.mfaCodePlaceholder')}
                  required
                />
                <div className="password-page__actions">
                  <Button type="submit" disabled={isBusy}>
                    {isBusy ? t('pages.security.disabling') : t('pages.security.disable')}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="password-page__actions">
                <Button type="button" onClick={() => void handleStartEnroll()} disabled={isBusy}>
                  {isBusy ? t('pages.security.enabling') : t('pages.security.enable')}
                </Button>
              </div>
            )}
          </>
        )}
      </article>
    </section>
  );
}
