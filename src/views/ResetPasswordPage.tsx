'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { LanguageToggle } from '../components/LanguageToggle';
import { ThemeToggle } from '../components/ThemeToggle';
import { Button } from '../components/ui/Button';
import { InputField } from '../components/ui/InputField';
import { supabase } from '../integrations/supabase/client';
import {
  getAuthErrorMessage,
  setPasswordAfterRecovery,
  signOutUser,
} from '../lib/authService';
import { useI18n } from '../lib/i18n';

type RecoveryPhase = 'loading' | 'ready' | 'invalid';

export function ResetPasswordPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [phase, setPhase] = useState<RecoveryPhase>('loading');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const hashSuggestsRecovery =
      typeof window !== 'undefined' &&
      (window.location.hash.includes('type=recovery') ||
        window.location.hash.includes('type%3Drecovery'));

    const searchHasCode =
      typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('code');

    let done = false;

    let timeoutId = 0;

    const finish = (next: RecoveryPhase) => {
      if (cancelled || done) {
        return;
      }
      done = true;
      if (next === 'ready' && timeoutId) {
        window.clearTimeout(timeoutId);
      }
      setPhase(next);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        finish('ready');
      }
    });

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && (hashSuggestsRecovery || searchHasCode)) {
        finish('ready');
      }
    });

    timeoutId = window.setTimeout(() => {
      finish('invalid');
    }, 5000);

    return () => {
      cancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (newPassword !== confirmPassword) {
      setLocalError(t('auth.resetPasswordMismatch'));
      return;
    }

    setIsSubmitting(true);
    setLocalError(null);

    try {
      await setPasswordAfterRecovery(newPassword);
      await signOutUser();
      router.replace('/login?reset=success');
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
            {phase === 'loading' ? (
              <p className="auth-panel__subtitle auth-panel__subtitle--muted">{t('app.loading')}</p>
            ) : null}

            {phase === 'invalid' ? (
              <>
                <div className="auth-panel__intro">
                  <h1 className="auth-panel__title">{t('auth.resetPasswordTitle')}</h1>
                </div>
                <p className="auth-inline-error">{t('auth.resetPasswordInvalidLink')}</p>
                <p className="auth-panel__footer">
                  <Link href="/forgot-password" className="auth-text-link">
                    {t('auth.forgotPasswordTitle')}
                  </Link>
                  {' · '}
                  <Link href="/login" className="auth-text-link">
                    {t('auth.resetPasswordBackToLogin')}
                  </Link>
                </p>
              </>
            ) : null}

            {phase === 'ready' ? (
              <>
                <div className="auth-panel__intro">
                  <h1 className="auth-panel__title">{t('auth.resetPasswordTitle')}</h1>
                  <p className="auth-panel__subtitle auth-panel__subtitle--muted">{t('auth.resetPasswordLead')}</p>
                </div>

                {localError ? <p className="auth-inline-error">{localError}</p> : null}

                <form className="auth-form" onSubmit={handleSubmit}>
                  <InputField
                    id="reset-new-password"
                    label={t('auth.resetPasswordNew')}
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder={t('auth.resetPasswordNewPlaceholder')}
                    autoComplete="new-password"
                    required
                  />
                  <InputField
                    id="reset-confirm-password"
                    label={t('auth.resetPasswordConfirm')}
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder={t('auth.resetPasswordConfirmPlaceholder')}
                    autoComplete="new-password"
                    required
                  />
                  <Button type="submit" fullWidth disabled={isSubmitting}>
                    {isSubmitting ? t('auth.resetPasswordSubmitting') : t('auth.resetPasswordSubmit')}
                  </Button>
                </form>

                <p className="auth-panel__footer">
                  <Link href="/login" className="auth-text-link">
                    {t('auth.resetPasswordBackToLogin')}
                  </Link>
                </p>
              </>
            ) : null}
          </section>
        </div>
      </div>

      <aside className="auth-layout__wide" aria-hidden="true" />
    </main>
  );
}
