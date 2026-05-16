'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { creditTestBrhBalanceAction } from '@/app/actions/brh-test-credit';
import { Button } from '../components/ui/Button';
import { InputField } from '../components/ui/InputField';
import { useAuth } from '../hooks/useAuth';
import { useBrhBalance } from '../hooks/useBrhBalance';
import { formatBrhAmount } from '../lib/format/brh-display';
import type { AdminTestSettingsRow } from '../lib/admin-test-settings/types';
import { useI18n } from '@/lib/i18n';
import { supabase } from '../integrations/supabase/client';

const SETTINGS_TABLE = 'admin_test_settings';

export function AdminSettingsPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { profile, user, isLoading: authLoading, isAuthorized } = useAuth();

  const [maxDeposit, setMaxDeposit] = useState('');
  const [maxWithdraw, setMaxWithdraw] = useState('');
  const [brhWallet, setBrhWallet] = useState('');
  const [pixWithdrawKey, setPixWithdrawKey] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreditingBrh, setIsCreditingBrh] = useState(false);
  const [brhCreditError, setBrhCreditError] = useState<string | null>(null);
  const [brhCreditSuccess, setBrhCreditSuccess] = useState<string | null>(null);
  const { balanceNumber, isLoading: isBrhBalanceLoading, refetch: refetchBrhBalance } = useBrhBalance();

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
          .select(
            'id, max_deposit_brl, max_withdraw_brl, brh_wallet_address, fiat_pix_withdraw_key, updated_at, updated_by_email',
          )
          .eq('id', 1)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          setLoadError(error.message);
          return;
        }

        const row = data as AdminTestSettingsRow | null;
        if (row) {
          setMaxDeposit(row.max_deposit_brl ?? '');
          setMaxWithdraw(row.max_withdraw_brl ?? '');
          setBrhWallet(row.brh_wallet_address ?? '');
          setPixWithdrawKey(row.fiat_pix_withdraw_key ?? '');
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

  const handleCreditTestBrh = async () => {
    setBrhCreditError(null);
    setBrhCreditSuccess(null);
    setIsCreditingBrh(true);
    try {
      const result = await creditTestBrhBalanceAction();
      if (!result.ok) {
        setBrhCreditError(result.message ?? result.code);
        return;
      }
      setBrhCreditSuccess(
        t('pages.settings.testBrhCreditSuccess')
          .replace('{{amount}}', result.credited)
          .replace('{{balance}}', result.balance),
      );
      void refetchBrhBalance();
    } catch (e) {
      setBrhCreditError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsCreditingBrh(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveError(null);
    setSuccessMessage(null);
    setIsSaving(true);

    try {
      const email = user?.email?.trim() ?? null;
      const now = new Date().toISOString();
      const row: Partial<AdminTestSettingsRow> & { id: number } = {
        id: 1,
        max_deposit_brl: maxDeposit.trim(),
        max_withdraw_brl: maxWithdraw.trim(),
        brh_wallet_address: brhWallet.trim(),
        fiat_pix_withdraw_key: pixWithdrawKey.trim(),
        updated_by_email: email,
        updated_at: now,
      };

      const { error } = await supabase.from(SETTINGS_TABLE).upsert(row, { onConflict: 'id' });

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
      <section className="admin-settings-layout surface">
        <p className="surface__lead">{t('pages.settings.loading')}</p>
      </section>
    );
  }

  return (
    <section className="admin-settings-layout">
      <article className="surface admin-settings-card">
        <div className="admin-settings-card__header">
          <div>
            <p className="eyebrow">{t('pages.settings.eyebrow')}</p>
            <h2>{t('pages.settings.title')}</h2>
            <p className="surface__lead">{t('pages.settings.description')}</p>
          </div>
          <Link href="/app/dashboard" className="auth-text-link">
            {t('pages.settings.back')}
          </Link>
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
          <InputField
            id="brh-wallet"
            label={t('pages.settings.brhWallet')}
            type="text"
            value={brhWallet}
            onChange={(e) => setBrhWallet(e.target.value)}
            placeholder={t('pages.settings.brhWalletPlaceholder')}
            disabled={isLoading || !!loadError}
            autoComplete="off"
          />
          <InputField
            id="pix-withdraw"
            label={t('pages.settings.pixWithdraw')}
            type="text"
            value={pixWithdrawKey}
            onChange={(e) => setPixWithdrawKey(e.target.value)}
            placeholder={t('pages.settings.pixWithdrawPlaceholder')}
            disabled={isLoading || !!loadError}
            autoComplete="off"
          />

          <Button type="submit" disabled={isSaving || isLoading || !!loadError}>
            {isSaving ? t('pages.settings.saving') : t('pages.settings.save')}
          </Button>
        </form>

        <div className="admin-settings-test-tools">
          <p className="eyebrow">{t('pages.settings.testToolsEyebrow')}</p>
          <h3>{t('pages.settings.testBrhCreditTitle')}</h3>
          <p className="surface__lead">{t('pages.settings.testBrhCreditLead')}</p>
          <p className="admin-settings-test-tools__balance">
            {t('pages.settings.testBrhCurrentBalance')}:{' '}
            <strong>
              {isBrhBalanceLoading
                ? '…'
                : `${formatBrhAmount(balanceNumber, locale === 'pt' ? 'pt-BR' : 'en-US')} BRH`}
            </strong>
          </p>
          {brhCreditError ? (
            <p className="auth-inline-error" role="alert">
              {brhCreditError}
            </p>
          ) : null}
          {brhCreditSuccess ? (
            <p className="form-success-message" role="status">
              {brhCreditSuccess}
            </p>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            disabled={isCreditingBrh || isLoading}
            onClick={() => void handleCreditTestBrh()}
          >
            {isCreditingBrh ? t('pages.settings.testBrhCrediting') : t('pages.settings.testBrhCreditButton')}
          </Button>
        </div>
      </article>
    </section>
  );
}
