'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '../components/ui/Button';
import { InputField } from '../components/ui/InputField';
import { useAuth } from '../hooks/useAuth';
import { getAuthErrorMessage, signInUser } from '../lib/authService';
import { useI18n } from '../lib/i18n';

export function LoginPage() {
  const { authError, clearAuthError } = useAuth();
  const { t } = useI18n();
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
    <main className="auth-page">
      <section className="auth-card auth-card--form">
        <div className="auth-card__header">
          <div className="auth-card__title-group">
            <h1>{t('auth.title')}</h1>
          </div>
        </div>

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
      </section>
    </main>
  );
}