import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '../components/ui/Button';
import { InputField } from '../components/ui/InputField';
import { useAuth } from '../hooks/useAuth';
import { changeUserPassword, getAuthErrorMessage } from '../lib/authService';
import { useI18n } from '../lib/i18n';

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
    <section className="page-grid page-grid--single">
      <article className="surface surface--hero password-hero">
        <div>
          <p className="eyebrow">{t('pages.changePassword.eyebrow')}</p>
          <h2>{t('pages.changePassword.title')}</h2>
          <p className="surface__lead">{t('pages.changePassword.description')}</p>
        </div>

        <div className="password-hero__account">
          <span className="password-hero__label">{t('pages.changePassword.accountLabel')}</span>
          <strong>{userEmail}</strong>
        </div>
      </article>

      <article className="surface password-form-card">
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

          {errorMessage ? <p className="auth-inline-error">{errorMessage}</p> : null}
          {successMessage ? <p className="form-success-message">{successMessage}</p> : null}

          <div className="password-form__actions">
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting ? t('pages.changePassword.submitting') : t('pages.changePassword.submit')}
            </Button>
          </div>
        </form>
      </article>
    </section>
  );
}
