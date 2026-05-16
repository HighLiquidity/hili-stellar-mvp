'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { LanguageToggle } from '../components/LanguageToggle';
import { ThemeToggle } from '../components/ThemeToggle';
import { Button } from '../components/ui/Button';
import { InputField } from '../components/ui/InputField';
import { getAuthErrorMessage, requestPasswordReset } from '../lib/authService';
import { useI18n } from '@/lib/i18n';

export function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setLocalError(null);

    try {
      await requestPasswordReset(email);
      setSuccess(true);
    } catch (error) {
      setLocalError(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-layout">
      <div className="auth-layout__narrow">
        <header className="auth-layout__toolbar">
          <Link href="/login" className="auth-layout__brand auth-layout__brand--link">
            Hi-Li :: Stellar
          </Link>
          <div className="auth-layout__toggles">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </header>

        <div className="auth-layout__form-region">
          <section className="auth-panel">
            <div className="auth-panel__intro">
              <h1 className="auth-panel__title">{t('auth.forgotPasswordTitle')}</h1>
              <p className="auth-panel__subtitle auth-panel__subtitle--muted">{t('auth.forgotPasswordLead')}</p>
            </div>

            {success ? (
              <p className="form-success-message">{t('auth.forgotPasswordSuccess')}</p>
            ) : null}
            {!success && localError ? <p className="auth-inline-error">{localError}</p> : null}

            {!success ? (
              <form className="auth-form" onSubmit={handleSubmit}>
                <InputField
                  id="forgot-email"
                  label={t('auth.email')}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                  autoComplete="email"
                  required
                />
                <Button type="submit" fullWidth disabled={isSubmitting}>
                  {isSubmitting ? t('auth.forgotPasswordSending') : t('auth.forgotPasswordSubmit')}
                </Button>
              </form>
            ) : null}

            <p className="auth-panel__footer">
              <Link href="/login" className="auth-text-link">
                {t('auth.forgotPasswordBackToLogin')}
              </Link>
            </p>
          </section>
        </div>
      </div>

      <aside className="auth-layout__wide" aria-hidden="true" />
    </main>
  );
}
