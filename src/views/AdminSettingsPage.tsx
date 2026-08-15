'use client';

import type { FormEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  getAdminRampSettingsAction,
  updateBrhRampEnabledAction,
  updateBrhRampSettingsAction,
  updateUsdcRampEnabledAction,
  updateUsdcRampSettingsAction,
} from '@/app/actions/admin-settings';
import { RampEnableToggle } from '../components/RampEnableToggle';
import {
  RampToggleConfirmDialog,
  type RampToggleKind,
} from '../components/RampToggleConfirmDialog';
import { Button } from '../components/ui/Button';
import { InputField } from '../components/ui/InputField';
import { useAuth } from '../hooks/useAuth';
import { useI18n } from '@/lib/i18n';

type UsdcForm = {
  enabled: boolean;
  maxOnrampBrl: string;
  maxOfframpBrl: string;
};

type BrhForm = {
  enabled: boolean;
  maxDepositBrl: string;
  maxWithdrawBrl: string;
};

type PendingToggle = {
  ramp: RampToggleKind;
  nextEnabled: boolean;
};

export default function AdminSettingsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { profile, session, isLoading: authLoading, isAuthorized, refreshRampFlags } = useAuth();
  const accessToken = session?.access_token ?? null;

  const [usdcForm, setUsdcForm] = useState<UsdcForm>({
    enabled: true,
    maxOnrampBrl: '',
    maxOfframpBrl: '',
  });
  const [brhForm, setBrhForm] = useState<BrhForm>({
    enabled: true,
    maxDepositBrl: '',
    maxWithdrawBrl: '',
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [usdcError, setUsdcError] = useState<string | null>(null);
  const [brhError, setBrhError] = useState<string | null>(null);
  const [usdcSuccess, setUsdcSuccess] = useState<string | null>(null);
  const [brhSuccess, setBrhSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingUsdc, setIsSavingUsdc] = useState(false);
  const [isSavingBrh, setIsSavingBrh] = useState(false);
  const [pendingToggle, setPendingToggle] = useState<PendingToggle | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    if (authLoading || !isAuthorized) return;
    if (profile?.role !== 'admin') {
      router.replace('/app/dashboard');
    }
  }, [authLoading, isAuthorized, profile?.role, router]);

  useEffect(() => {
    if (authLoading || profile?.role !== 'admin' || !accessToken) return;

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const result = await getAdminRampSettingsAction(accessToken as string);
        if (cancelled) return;
        if (!result.ok) {
          setLoadError(result.message);
          return;
        }
        setUsdcForm({
          enabled: result.data.usdcRampEnabled,
          maxOnrampBrl: result.data.maxOnrampBrl,
          maxOfframpBrl: result.data.maxOfframpBrl,
        });
        setBrhForm({
          enabled: result.data.brhRampEnabled,
          maxDepositBrl: result.data.maxDepositBrl,
          maxWithdrawBrl: result.data.maxWithdrawBrl,
        });
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
  }, [accessToken, authLoading, profile?.role]);

  const handleSaveUsdc = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUsdcError(null);
    setUsdcSuccess(null);
    if (!accessToken) {
      setUsdcError(t('pages.userManagement.errors.session'));
      return;
    }
    setIsSavingUsdc(true);
    try {
      const result = await updateUsdcRampSettingsAction(accessToken, {
        maxOnrampBrl: usdcForm.maxOnrampBrl,
        maxOfframpBrl: usdcForm.maxOfframpBrl,
      });
      if (!result.ok) {
        setUsdcError(result.message);
        return;
      }
      setUsdcForm({
        enabled: result.data.usdcRampEnabled,
        maxOnrampBrl: result.data.maxOnrampBrl,
        maxOfframpBrl: result.data.maxOfframpBrl,
      });
      setUsdcSuccess(t('pages.settings.saveUsdcSuccess'));
    } finally {
      setIsSavingUsdc(false);
    }
  };

  const handleSaveBrh = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBrhError(null);
    setBrhSuccess(null);
    if (!accessToken) {
      setBrhError(t('pages.userManagement.errors.session'));
      return;
    }
    setIsSavingBrh(true);
    try {
      const result = await updateBrhRampSettingsAction(accessToken, {
        maxDepositBrl: brhForm.maxDepositBrl,
        maxWithdrawBrl: brhForm.maxWithdrawBrl,
      });
      if (!result.ok) {
        setBrhError(result.message);
        return;
      }
      setBrhForm({
        enabled: result.data.brhRampEnabled,
        maxDepositBrl: result.data.maxDepositBrl,
        maxWithdrawBrl: result.data.maxWithdrawBrl,
      });
      setBrhSuccess(t('pages.settings.saveBrhSuccess'));
    } finally {
      setIsSavingBrh(false);
    }
  };

  const handleCancelToggle = useCallback(() => {
    if (isToggling) return;
    setPendingToggle(null);
  }, [isToggling]);

  const handleConfirmToggle = async () => {
    if (!pendingToggle) return;
    if (!accessToken) {
      const message = t('pages.userManagement.errors.session');
      if (pendingToggle.ramp === 'usdc') setUsdcError(message);
      else setBrhError(message);
      setPendingToggle(null);
      return;
    }

    setIsToggling(true);
    if (pendingToggle.ramp === 'usdc') {
      setUsdcError(null);
      setUsdcSuccess(null);
    } else {
      setBrhError(null);
      setBrhSuccess(null);
    }

    try {
      const result =
        pendingToggle.ramp === 'usdc'
          ? await updateUsdcRampEnabledAction(accessToken, pendingToggle.nextEnabled)
          : await updateBrhRampEnabledAction(accessToken, pendingToggle.nextEnabled);

      if (!result.ok) {
        if (pendingToggle.ramp === 'usdc') setUsdcError(result.message);
        else setBrhError(result.message);
        return;
      }

      setUsdcForm((prev) => ({ ...prev, enabled: result.data.usdcRampEnabled }));
      setBrhForm((prev) => ({ ...prev, enabled: result.data.brhRampEnabled }));

      if (pendingToggle.ramp === 'usdc') {
        setUsdcSuccess(
          pendingToggle.nextEnabled
            ? t('pages.settings.toggleUsdcOnSuccess')
            : t('pages.settings.toggleUsdcOffSuccess'),
        );
      } else {
        setBrhSuccess(
          pendingToggle.nextEnabled
            ? t('pages.settings.toggleBrhOnSuccess')
            : t('pages.settings.toggleBrhOffSuccess'),
        );
      }
      await refreshRampFlags();
      setPendingToggle(null);
    } finally {
      setIsToggling(false);
    }
  };

  const fieldsDisabled = isLoading || !!loadError;

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
    <section className="dashboard-layout settings-page">
      <div className="settings-page__header">
        <p className="eyebrow">{t('pages.settings.eyebrow')}</p>
        <h1 className="settings-page__title">{t('pages.settings.title')}</h1>
        <p className="surface__lead">{t('pages.settings.description')}</p>
      </div>

      {loadError ? (
        <p className="auth-inline-error" role="alert">
          {t('pages.settings.loadError')}
          {`: ${loadError}`}
        </p>
      ) : null}

      <div className="settings-page__cards">
        <article className={`surface admin-settings-card${usdcForm.enabled ? '' : ' admin-settings-card--off'}`}>
          <div className="admin-settings-card__header">
            <h2 className="admin-settings-card__title">{t('pages.settings.usdcTitle')}</h2>
            <RampEnableToggle
              enabled={usdcForm.enabled}
              disabled={fieldsDisabled || isSavingUsdc || isToggling}
              onLabel={t('pages.settings.toggleOn')}
              offLabel={t('pages.settings.toggleOff')}
              ariaLabel={
                usdcForm.enabled
                  ? t('pages.settings.toggleAriaDisable').replace('{{ramp}}', t('pages.settings.usdcTitle'))
                  : t('pages.settings.toggleAriaEnable').replace('{{ramp}}', t('pages.settings.usdcTitle'))
              }
              onRequestToggle={() => {
                setUsdcError(null);
                setUsdcSuccess(null);
                setPendingToggle({ ramp: 'usdc', nextEnabled: !usdcForm.enabled });
              }}
            />
          </div>

          {usdcError ? (
            <p className="auth-inline-error" role="alert">
              {usdcError}
            </p>
          ) : null}
          {usdcSuccess ? (
            <p className="form-success-message" role="status">
              {usdcSuccess}
            </p>
          ) : null}

          <form className="admin-settings-form" onSubmit={handleSaveUsdc}>
            <InputField
              id="max-onramp"
              label={t('pages.settings.maxOnramp')}
              type="text"
              inputMode="decimal"
              value={usdcForm.maxOnrampBrl}
              onChange={(e) => setUsdcForm((prev) => ({ ...prev, maxOnrampBrl: e.target.value }))}
              placeholder={t('pages.settings.maxOnrampPlaceholder')}
              disabled={fieldsDisabled || isSavingUsdc}
              required
            />
            <InputField
              id="max-offramp"
              label={t('pages.settings.maxOfframp')}
              type="text"
              inputMode="decimal"
              value={usdcForm.maxOfframpBrl}
              onChange={(e) => setUsdcForm((prev) => ({ ...prev, maxOfframpBrl: e.target.value }))}
              placeholder={t('pages.settings.maxOfframpPlaceholder')}
              disabled={fieldsDisabled || isSavingUsdc}
              required
            />
            <Button type="submit" disabled={isSavingUsdc || fieldsDisabled}>
              {isSavingUsdc ? t('pages.settings.saving') : t('pages.settings.save')}
            </Button>
          </form>
        </article>

        <article className={`surface admin-settings-card${brhForm.enabled ? '' : ' admin-settings-card--off'}`}>
          <div className="admin-settings-card__header">
            <h2 className="admin-settings-card__title">{t('pages.settings.brhTitle')}</h2>
            <RampEnableToggle
              enabled={brhForm.enabled}
              disabled={fieldsDisabled || isSavingBrh || isToggling}
              onLabel={t('pages.settings.toggleOn')}
              offLabel={t('pages.settings.toggleOff')}
              ariaLabel={
                brhForm.enabled
                  ? t('pages.settings.toggleAriaDisable').replace('{{ramp}}', t('pages.settings.brhTitle'))
                  : t('pages.settings.toggleAriaEnable').replace('{{ramp}}', t('pages.settings.brhTitle'))
              }
              onRequestToggle={() => {
                setBrhError(null);
                setBrhSuccess(null);
                setPendingToggle({ ramp: 'brh', nextEnabled: !brhForm.enabled });
              }}
            />
          </div>

          {brhError ? (
            <p className="auth-inline-error" role="alert">
              {brhError}
            </p>
          ) : null}
          {brhSuccess ? (
            <p className="form-success-message" role="status">
              {brhSuccess}
            </p>
          ) : null}

          <form className="admin-settings-form" onSubmit={handleSaveBrh}>
            <InputField
              id="max-deposit"
              label={t('pages.settings.maxDeposit')}
              type="text"
              inputMode="decimal"
              value={brhForm.maxDepositBrl}
              onChange={(e) => setBrhForm((prev) => ({ ...prev, maxDepositBrl: e.target.value }))}
              placeholder={t('pages.settings.maxDepositPlaceholder')}
              disabled={fieldsDisabled || isSavingBrh}
              required
            />
            <InputField
              id="max-withdraw"
              label={t('pages.settings.maxWithdraw')}
              type="text"
              inputMode="decimal"
              value={brhForm.maxWithdrawBrl}
              onChange={(e) => setBrhForm((prev) => ({ ...prev, maxWithdrawBrl: e.target.value }))}
              placeholder={t('pages.settings.maxWithdrawPlaceholder')}
              disabled={fieldsDisabled || isSavingBrh}
              required
            />
            <Button type="submit" disabled={isSavingBrh || fieldsDisabled}>
              {isSavingBrh ? t('pages.settings.saving') : t('pages.settings.save')}
            </Button>
          </form>
        </article>
      </div>

      <RampToggleConfirmDialog
        open={pendingToggle !== null}
        ramp={pendingToggle?.ramp ?? 'usdc'}
        nextEnabled={pendingToggle?.nextEnabled ?? false}
        isSubmitting={isToggling}
        onCancel={handleCancelToggle}
        onConfirm={() => {
          void handleConfirmToggle();
        }}
      />
    </section>
  );
}
