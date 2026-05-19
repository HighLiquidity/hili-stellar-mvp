'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '../components/ui/Button';
import { InputField } from '../components/ui/InputField';
import { useAuth } from '../hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { supabase } from '../integrations/supabase/client';

const SETTINGS_TABLE = 'admin_test_settings';

type SettingsLimitsRow = {
  max_deposit_brl: string;
  max_withdraw_brl: string;
};

export default function AdminSettingsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { profile, user, isLoading: authLoading, isAuthorized } = useAuth();

  const [maxDeposit, setMaxDeposit] = useState('');
  const [maxWithdraw, setMaxWithdraw] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (authLoading || !isAuthorized) return;
    if (profile?.role !== 'admin') {
      router.replace('/app/dashboard');
    }
  }, [authLoading, isAuthorized, profile?.role, router]);

  useEffect(() => {
    if (authLoading || profile?.role !== 'admin') return;

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const { data, error } = await supabase
          .from(SETTINGS_TABLE)
          .select('max_deposit_brl, max_withdraw_brl')
          .eq('id', 1)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          setLoadError(error.message);
          return;
        }

        const row = data as SettingsLimitsRow | null;
        if (row) {
          setMaxDeposit(row.max_deposit_brl ?? '');
          setMaxWithdraw(row.max_withdraw_brl ?? '');
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [authLoading, profile?.role]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveError(null);
    setSuccessMessage(null);
    setIsSaving(true);

    try {
      const email = user?.email?.trim() ?? null;
      const now = new Date().toISOString();

      const { error } = await supabase
        .from(SETTINGS_TABLE)
        .update({
          max_deposit_brl: maxDeposit.trim(),
          max_withdraw_brl: maxWithdraw.trim(),
          updated_by_email: email,
          updated_at: now,
        })
        .eq('id', 1);

      if (error) {
        setSaveError(error.message);
        return;
      }

      setSuccessMessage(t('pages.settings.saveSuccess'));
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSaving(false);
    }
  };

  if (authLoading || profile?.role !== 'admin') {
    return (
      <section className="dashboard-layout">
        <article className="surface">
          <p className="surface__lead">{t('pages.settings.loading')}</p>
        </article>
      </section>
    );
  }

  return (
    <section className="dashboard-layout">
      <article className="surface admin-settings-card">
        <div className="admin-settings-card__header">
          <div>
            <p className="eyebrow">{t('pages.settings.eyebrow')}</p>
          </div>
        </div>

        {loadError ? (
          <p className="auth-inline-error" role="alert">
            {t('pages.settings.loadError')}
            {`: ${loadError}`}
          </p>
        ) : null}

        {saveError ? (
          <p className="auth-inline-error" role="alert">
            {saveError}
          </p>
        ) : null}

        {successMessage ? (
          <p className="form-success-message" role="status">
            {successMessage}
          </p>
        ) : null}

        <form className="admin-settings-form" onSubmit={handleSubmit}>
          <InputField
            id="max-deposit"
            label={t('pages.settings.maxDeposit')}
            type="text"
            inputMode="decimal"
            value={maxDeposit}
            onChange={(e) => setMaxDeposit(e.target.value)}
            placeholder={t('pages.settings.maxDepositPlaceholder')}
            disabled={isLoading || !!loadError}
            required
          />
          <InputField
            id="max-withdraw"
            label={t('pages.settings.maxWithdraw')}
            type="text"
            inputMode="decimal"
            value={maxWithdraw}
            onChange={(e) => setMaxWithdraw(e.target.value)}
            placeholder={t('pages.settings.maxWithdrawPlaceholder')}
            disabled={isLoading || !!loadError}
            required
          />

          <Button type="submit" disabled={isSaving || isLoading || !!loadError}>
            {isSaving ? t('pages.settings.saving') : t('pages.settings.save')}
          </Button>
        </form>
      </article>
    </section>
  );
}
