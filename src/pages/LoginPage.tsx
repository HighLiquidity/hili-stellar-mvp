import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../integrations/supabase/client';
import { useI18n } from '../lib/i18n';
import { useTheme } from '../lib/theme';

export function LoginPage() {
  const navigate = useNavigate();
  const { isAuthorized, authError } = useAuth();
  const { t } = useI18n();
  const { theme } = useTheme();

  useEffect(() => {
    if (isAuthorized) {
      navigate('/app/dashboard', { replace: true });
    }
  }, [isAuthorized, navigate]);

  const localization = useMemo(
    () => ({
      variables: {
        sign_in: {
          email_label: t('auth.email'),
          password_label: t('auth.password'),
          email_input_placeholder: t('auth.emailPlaceholder'),
          password_input_placeholder: t('auth.passwordPlaceholder'),
          button_label: t('auth.submit'),
        },
      },
    }),
    [t],
  );

  const errorMessage = authError === 'access_denied' ? t('auth.accessDenied') : authError;

  return (
    <main className="auth-page">
      <section className="auth-card auth-card--form">
        <div className="auth-card__header">
          <p className="status-pill">{t('app.demoBadge')}</p>
          <div className="auth-card__title-group">
            <h1>{t('auth.title')}</h1>
            <p className="auth-card__lead">{t('auth.subtitle')}</p>
          </div>
        </div>

        {errorMessage ? <p className="auth-inline-error">{errorMessage}</p> : null}

        <div className="auth-supabase">
          <Auth
            supabaseClient={supabase}
            providers={[]}
            view="sign_in"
            theme={theme}
            localization={localization}
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: {
                  colors: {
                    brand: '#586bf3',
                    brandAccent: '#4155e6',
                    inputBackground: 'transparent',
                    inputBorder: 'var(--border)',
                    inputBorderHover: 'var(--accent)',
                    inputBorderFocus: 'var(--accent)',
                    inputText: 'var(--text)',
                    inputLabelText: 'var(--text)',
                    inputPlaceholder: 'var(--text-muted)',
                    messageText: 'var(--text-muted)',
                    anchorTextColor: 'var(--accent-strong)',
                    defaultButtonBackground: 'var(--surface-muted)',
                    defaultButtonBackgroundHover: 'var(--accent-soft)',
                    defaultButtonBorder: 'var(--border)',
                    defaultButtonText: 'var(--text)',
                    dividerBackground: 'var(--border)',
                  },
                  radii: {
                    borderRadiusButton: '999px',
                    buttonBorderRadius: '999px',
                    inputBorderRadius: '16px',
                  },
                  space: {
                    emailInputSpacing: '16px',
                    socialAuthSpacing: '12px',
                    buttonPadding: '14px',
                    inputPadding: '14px',
                  },
                },
              },
            }}
          />
        </div>

        <p className="auth-card__footnote">{t('auth.accessNotice')}</p>
      </section>
    </main>
  );
}