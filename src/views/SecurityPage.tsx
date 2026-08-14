'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button } from '../components/ui/Button';
import { InputField } from '../components/ui/InputField';
import { useAuth } from '../hooks/useAuth';
import {
  changeUserPassword,
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
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordTotpCode, setPasswordTotpCode] = useState('');
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const [isTotpBusy, setIsTotpBusy] = useState(false);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpError, setTotpError] = useState<string | null>(null);
  const [totpSuccess, setTotpSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const userEmail = user?.email ?? '';

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const factor = await getVerifiedTotpFactor();
      setTotpEnabled(Boolean(factor));
    } catch (error) {
      setLoadError(getAuthErrorMessage(error));
      setTotpEnabled(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const canSubmitPassword = useMemo(
    () =>
      Boolean(
        currentPassword &&
          newPassword &&
          confirmPassword &&
          (!totpEnabled || passwordTotpCode.trim()) &&
          !isPasswordSubmitting,
      ),
    [confirmPassword, currentPassword, isPasswordSubmitting, newPassword, passwordTotpCode, totpEnabled],
  );

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!userEmail) {
      setPasswordError(t('pages.changePassword.errors.missingUser'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError(t('pages.changePassword.errors.passwordMismatch'));
      setPasswordSuccess(null);
      return;
    }

    setIsPasswordSubmitting(true);
    setPasswordError(null);
    setPasswordSuccess(null);

    try {
      await changeUserPassword({
        email: userEmail,
        currentPassword,
        newPassword,
        totpCode: totpEnabled ? passwordTotpCode : undefined,
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordTotpCode('');
      setPasswordSuccess(t('pages.changePassword.success'));
    } catch (error) {
      setPasswordError(getAuthErrorMessage(error));
    } finally {
      setIsPasswordSubmitting(false);
    }
  };

  const handleStartEnroll = async () => {
    setIsTotpBusy(true);
    setTotpError(null);
    setTotpSuccess(null);
    setCopied(false);
    try {
      const next = await enrollTotpFactor();
      setEnrollment(next);
      setTotpCode('');
    } catch (error) {
      setTotpError(getAuthErrorMessage(error));
    } finally {
      setIsTotpBusy(false);
    }
  };

  const handleCancelEnroll = async () => {
    if (!enrollment) {
      return;
    }

    setIsTotpBusy(true);
    setTotpError(null);
    try {
      await unenrollTotpFactor(enrollment.factorId);
      setEnrollment(null);
      setTotpCode('');
    } catch (error) {
      setTotpError(getAuthErrorMessage(error));
    } finally {
      setIsTotpBusy(false);
    }
  };

  const handleVerifyEnroll = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!enrollment) {
      return;
    }

    setIsTotpBusy(true);
    setTotpError(null);
    setTotpSuccess(null);
    try {
      await verifyTotpEnrollment(enrollment.factorId, totpCode);
      setEnrollment(null);
      setTotpCode('');
      setTotpEnabled(true);
      setTotpSuccess(t('pages.security.successEnabled'));
    } catch (error) {
      setTotpError(getAuthErrorMessage(error));
    } finally {
      setIsTotpBusy(false);
    }
  };

  const handleDisable = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const confirmed = window.confirm(t('pages.security.confirmDisable'));
    if (!confirmed) {
      return;
    }

    setIsTotpBusy(true);
    setTotpError(null);
    setTotpSuccess(null);
    try {
      await disableVerifiedTotp(totpCode);
      setTotpCode('');
      setPasswordTotpCode('');
      setTotpEnabled(false);
      setTotpSuccess(t('pages.security.successDisabled'));
    } catch (error) {
      setTotpError(getAuthErrorMessage(error));
    } finally {
      setIsTotpBusy(false);
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
    <section className="page-grid page-grid--single password-page security-page">
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

      <div className="security-page__cards">
      <article className="surface password-page__card">
        <header>
          <h3 className="security-section-title">{t('pages.security.passwordTitle')}</h3>
          <p className="surface__lead">{t('pages.security.passwordDescription')}</p>
        </header>

        <form className="password-form" onSubmit={handlePasswordSubmit}>
          <InputField
            id="current-password"
            label={t('pages.changePassword.currentPassword')}
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            placeholder={t('pages.changePassword.currentPasswordPlaceholder')}
            autoComplete="current-password"
            required
          />

          <InputField
            id="new-password"
            label={t('pages.changePassword.newPassword')}
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder={t('pages.changePassword.newPasswordPlaceholder')}
            autoComplete="new-password"
            required
          />

          <InputField
            id="confirm-password"
            label={t('pages.changePassword.confirmPassword')}
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder={t('pages.changePassword.confirmPasswordPlaceholder')}
            autoComplete="new-password"
            required
          />

          {totpEnabled ? (
            <InputField
              id="change-password-totp"
              label={t('pages.changePassword.totpCode')}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={8}
              value={passwordTotpCode}
              onChange={(event) => setPasswordTotpCode(event.target.value)}
              placeholder={t('pages.changePassword.totpCodePlaceholder')}
              required
            />
          ) : null}

          {passwordError ? <p className="auth-inline-error">{passwordError}</p> : null}
          {passwordSuccess ? <p className="form-success-message">{passwordSuccess}</p> : null}

          <div className="password-page__actions">
            <Button type="submit" fullWidth disabled={!canSubmitPassword}>
              {isPasswordSubmitting ? t('pages.changePassword.submitting') : t('pages.changePassword.submit')}
            </Button>
          </div>
        </form>
      </article>

      <article className="surface password-page__card">
        <header>
          <h3 className="security-section-title">{t('pages.security.totpTitle')}</h3>
          <p className="surface__lead">{t('pages.security.totpDescription')}</p>
        </header>

        {isLoading ? (
          <p className="surface__lead">{t('pages.security.loading')}</p>
        ) : (
          <>
            {loadError ? <p className="auth-inline-error">{loadError}</p> : null}

            <p className={`security-status${totpEnabled ? ' is-on' : ' is-off'}`}>
              {totpEnabled ? t('pages.security.statusOn') : t('pages.security.statusOff')}
            </p>

            {totpError ? <p className="auth-inline-error">{totpError}</p> : null}
            {totpSuccess ? <p className="form-success-message">{totpSuccess}</p> : null}

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
                  value={totpCode}
                  onChange={(event) => setTotpCode(event.target.value)}
                  placeholder={t('auth.mfaCodePlaceholder')}
                  required
                />

                <div className="password-page__actions security-actions">
                  <Button type="submit" disabled={isTotpBusy}>
                    {isTotpBusy ? t('pages.security.verifying') : t('pages.security.verify')}
                  </Button>
                  <Button type="button" variant="ghost" disabled={isTotpBusy} onClick={() => void handleCancelEnroll()}>
                    {t('pages.security.cancelEnroll')}
                  </Button>
                </div>
              </form>
            ) : totpEnabled ? (
              <form className="password-form" onSubmit={handleDisable}>
                <InputField
                  id="security-disable-code"
                  label={t('auth.mfaCode')}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={8}
                  value={totpCode}
                  onChange={(event) => setTotpCode(event.target.value)}
                  placeholder={t('auth.mfaCodePlaceholder')}
                  required
                />
                <div className="password-page__actions">
                  <Button type="submit" disabled={isTotpBusy}>
                    {isTotpBusy ? t('pages.security.disabling') : t('pages.security.disable')}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="password-page__actions">
                <Button type="button" onClick={() => void handleStartEnroll()} disabled={isTotpBusy}>
                  {isTotpBusy ? t('pages.security.enabling') : t('pages.security.enable')}
                </Button>
              </div>
            )}
          </>
        )}
      </article>
      </div>
    </section>
  );
}
