'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button } from '../components/ui/Button';
import { InputField } from '../components/ui/InputField';
import { useAuth } from '../hooks/useAuth';
import { changeUserPassword, getAuthErrorMessage, getVerifiedTotpFactor } from '../lib/authService';
import { useI18n } from '@/lib/i18n';

export function ChangePasswordPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [hasTotp, setHasTotp] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const userEmail = user?.email ?? '';

  useEffect(() => {
    let cancelled = false;

    void getVerifiedTotpFactor()
      .then((factor) => {
        if (!cancelled) {
          setHasTotp(Boolean(factor));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasTotp(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const canSubmit = useMemo(
    () =>
      Boolean(
        currentPassword &&
          newPassword &&
          confirmPassword &&
          (!hasTotp || totpCode.trim()) &&
          !isSubmitting,
      ),
    [confirmPassword, currentPassword, hasTotp, isSubmitting, newPassword, totpCode],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!userEmail) {
      setErrorMessage(t('pages.changePassword.errors.missingUser'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage(t('pages.changePassword.errors.passwordMismatch'));
      setSuccessMessage(null);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await changeUserPassword({
        email: userEmail,
        currentPassword,
        newPassword,
        totpCode: hasTotp ? totpCode : undefined,
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTotpCode('');
      setSuccessMessage(t('pages.changePassword.success'));
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="page-grid page-grid--single password-page">
      <article className="surface password-page__card">
        <header className="password-page__header">
          <div>
            <p className="eyebrow">{t('pages.changePassword.eyebrow')}</p>
            <h2>{t('pages.changePassword.title')}</h2>
            <p className="surface__lead">{t('pages.changePassword.description')}</p>
          </div>

          <aside className="password-page__account" aria-label={t('pages.changePassword.accountLabel')}>
            <span className="password-page__account-label">{t('pages.changePassword.accountLabel')}</span>
            <strong>{userEmail}</strong>
          </aside>
        </header>

        <form className="password-form" onSubmit={handleSubmit}>
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

          {hasTotp ? (
            <InputField
              id="change-password-totp"
              label={t('pages.changePassword.totpCode')}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={8}
              value={totpCode}
              onChange={(event) => setTotpCode(event.target.value)}
              placeholder={t('pages.changePassword.totpCodePlaceholder')}
              required
            />
          ) : null}

          {errorMessage ? <p className="auth-inline-error">{errorMessage}</p> : null}
          {successMessage ? <p className="form-success-message">{successMessage}</p> : null}

          <div className="password-page__actions">
            <Button type="submit" fullWidth disabled={!canSubmit}>
              {isSubmitting ? t('pages.changePassword.submitting') : t('pages.changePassword.submit')}
            </Button>
          </div>
        </form>
      </article>
    </section>
  );
}
