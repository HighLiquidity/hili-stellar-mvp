import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Button } from '../components/ui/Button';
import { InputField } from '../components/ui/InputField';
import { useAuth } from '../hooks/useAuth';
import { changeUserPassword, getAuthErrorMessage } from '../lib/authService';
import { useI18n } from '../lib/i18n';

const pageStyle: CSSProperties = {
  width: '100%',
  maxWidth: '760px',
  margin: '0 auto',
};

const cardStyle: CSSProperties = {
  display: 'grid',
  gap: '24px',
  width: '100%',
};

const headerStyle: CSSProperties = {
  display: 'grid',
  gap: '18px',
};

const accountStyle: CSSProperties = {
  display: 'grid',
  gap: '6px',
  padding: '18px 20px',
  border: '1px solid rgba(88, 107, 243, 0.12)',
  borderRadius: '22px',
  background: 'var(--accent-soft)',
};

const accountLabelStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: '0.82rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

const accountValueStyle: CSSProperties = {
  fontSize: '1.02rem',
  lineHeight: 1.35,
  wordBreak: 'break-word',
};

const formStyle: CSSProperties = {
  display: 'grid',
  gap: '18px',
  width: '100%',
};

const actionsStyle: CSSProperties = {
  width: '100%',
};

export function ChangePasswordPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const userEmail = user?.email ?? '';

  const canSubmit = useMemo(
    () => Boolean(currentPassword && newPassword && confirmPassword && !isSubmitting),
    [confirmPassword, currentPassword, isSubmitting, newPassword],
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
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccessMessage(t('pages.changePassword.success'));
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section style={pageStyle}>
      <article className="surface" style={cardStyle}>
        <header style={headerStyle}>
          <div>
            <p className="eyebrow">{t('pages.changePassword.eyebrow')}</p>
            <h2>{t('pages.changePassword.title')}</h2>
            <p className="surface__lead">{t('pages.changePassword.description')}</p>
          </div>

          <div style={accountStyle}>
            <span style={accountLabelStyle}>{t('pages.changePassword.accountLabel')}</span>
            <strong style={accountValueStyle}>{userEmail}</strong>
          </div>
        </header>

        <form onSubmit={handleSubmit} style={formStyle}>
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

          {errorMessage ? <p className="auth-inline-error">{errorMessage}</p> : null}
          {successMessage ? <p className="form-success-message">{successMessage}</p> : null}

          <div style={actionsStyle}>
            <Button type="submit" fullWidth disabled={!canSubmit}>
              {isSubmitting ? t('pages.changePassword.submitting') : t('pages.changePassword.submit')}
            </Button>
          </div>
        </form>
      </article>
    </section>
  );
}
