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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        <div className="auth-card__header">
          <p className="status-pill">{t('app.demoBadge')}</p>
          <div className="auth-card__title-group">
            <h1>{t('auth.title')}</h1>
            <p className="auth-card__lead">{t('auth.subtitle')}</p>
          </div>
        </div>

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
