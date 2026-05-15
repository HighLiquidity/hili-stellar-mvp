import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useI18n } from '../lib/i18n';
import { Button } from '../components/ui/Button';
import { InputField } from '../components/ui/InputField';

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState('demo@fiatops.com');
  const [password, setPassword] = useState('mock-password');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      await login({ email, password });
      navigate('/app/deposit', { replace: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card auth-card--form">
        <p className="status-pill">{t('app.demoBadge')}</p>
        <h1>{t('auth.title')}</h1>
        <p className="auth-card__lead">{t('auth.subtitle')}</p>

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

        <div className="info-card">
          <h2>{t('auth.hintTitle')}</h2>
          <p>{t('auth.hintBody')}</p>
        </div>
      </section>

      <section className="auth-card auth-card--highlight" aria-label={t('auth.sideTitle')}>
        <div>
          <p className="eyebrow">{t('app.name')}</p>
          <h2>{t('auth.sideTitle')}</h2>
          <p className="auth-card__lead">{t('auth.sideBody')}</p>
        </div>

        <div className="metric-grid">
          <article className="metric-card">
            <strong>01</strong>
            <span>{t('auth.featureOne')}</span>
          </article>
          <article className="metric-card">
            <strong>02</strong>
            <span>{t('auth.featureTwo')}</span>
          </article>
          <article className="metric-card">
            <strong>03</strong>
            <span>{t('auth.featureThree')}</span>
          </article>
        </div>

        <div className="info-card info-card--accent">
          <h3>{t('auth.complianceTitle')}</h3>
          <p>{t('auth.complianceBody')}</p>
        </div>
      </section>
    </main>
  );
}
