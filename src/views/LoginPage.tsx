'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { LanguageToggle } from '../components/LanguageToggle';
import { ThemeToggle } from '../components/ThemeToggle';
import { Button } from '../components/ui/Button';
import { InputField } from '../components/ui/InputField';
import { useAuth } from '../hooks/useAuth';
import { getAuthErrorMessage, signInUser } from '../lib/authService';
import { useI18n } from '@/lib/i18n';

export function LoginPage() {
  const searchParams = useSearchParams();
  const { authError, clearAuthError } = useAuth();
  const { t } = useI18n();
  const resetSuccess = searchParams.get('reset') === 'success';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setLocalError(null);
    clearAuthError();

    try {
      await signInUser({ email, password });
    } catch (error) {
      setLocalError(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const errorMessage = authError === 'access_denied' ? t('auth.accessDenied') : authError ?? localError;

  return (
    <main className="auth-layout">
      <div className="auth-layout__narrow">
        <header className="auth-layout__toolbar">
          <span className="auth-layout__brand">Hi-Li :: Stellar</span>
          <div className="auth-layout__toggles">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </header>

        <div className="auth-layout__form-region">
          <section className="auth-panel" aria-label={t('auth.title')}>
            {resetSuccess ? (
              <p className="form-success-message">{t('auth.loginAfterResetMessage')}</p>
            ) : null}

            {errorMessage ? <p className="auth-inline-error">{errorMessage}</p> : null}

            <form className="auth-form" onSubmit={handleSubmit}>
              <InputField
                id="email"
                label={t('auth.email')}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t('auth.emailPlaceholder')}
                autoComplete="email"
                required
              />
              <InputField
                id="password"
                label={t('auth.password')}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t('auth.passwordPlaceholder')}
                autoComplete="current-password"
                required
              />
              <Button type="submit" fullWidth disabled={isSubmitting}>
                {isSubmitting ? t('auth.loading') : t('auth.submit')}
              </Button>
            </form>

            <p className="auth-panel__footer">
              <Link href="/forgot-password" className="auth-text-link">
                {t('auth.forgotPassword')}
              </Link>
            </p>
          </section>
        </div>
      </div>

      <aside className="auth-layout__wide" aria-hidden="true" />
    </main>
  );
}
