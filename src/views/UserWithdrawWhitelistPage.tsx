'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  deleteWithdrawWhitelistAction,
  getOnrampWithdrawNetworkAction,
  listWithdrawWhitelistAction,
  listWhitelistUsersAction,
  upsertWithdrawWhitelistAction,
} from '@/app/actions/withdraw-whitelist';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useI18n } from '@/lib/i18n';
import { UserPixWhitelistPanel } from '@/views/UserPixWhitelistPanel';
import type { WithdrawWhitelistNetwork, WithdrawWhitelistRow } from '@/lib/withdraw-whitelist/types';

type AdminWhitelistTab = 'wallets' | 'pix';

type FormMode = 'create' | 'edit' | null;

type EditableRow = WithdrawWhitelistRow & {
  user_email: string | null;
};

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}


export function UserWithdrawWhitelistPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { profile, isLoading: authLoading, isAuthorized } = useAuth();

  const [rows, setRows] = useState<EditableRow[]>([]);
  const [userOptions, setUserOptions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [formMode, setFormMode] = useState<FormMode>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [userEmail, setUserEmail] = useState('');
  const [address, setAddress] = useState('');
  const [network, setNetwork] = useState<WithdrawWhitelistNetwork>('STELLAR_TESTNET');
  const [label, setLabel] = useState('');
  const [memo, setMemo] = useState('');
  const [activeTab, setActiveTab] = useState<AdminWhitelistTab>('wallets');

  useEffect(() => {
    if (authLoading || !isAuthorized) return;
    if (profile?.role !== 'admin') {
      router.replace('/app/dashboard');
    }
  }, [authLoading, isAuthorized, profile?.role, router]);

  const loadRows = useCallback(async () => {
    setLoadError(null);
    setIsLoading(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        setLoadError(t('pages.userManagement.errors.session'));
        setRows([]);
        setUserOptions([]);
        return;
      }

      const [rowsResult, usersResult] = await Promise.all([
        listWithdrawWhitelistAction(token),
        listWhitelistUsersAction(token),
      ]);

      if (!rowsResult.ok) {
        setLoadError(rowsResult.message);
        setRows([]);
      } else {
        setRows(rowsResult.data);
      }

      if (!usersResult.ok) {
        setLoadError(usersResult.message);
        setUserOptions([]);
      } else {
        setUserOptions(usersResult.data.map((item) => item.email));
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setRows([]);
      setUserOptions([]);
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (authLoading || profile?.role !== 'admin') return;
    void loadRows();
  }, [authLoading, profile?.role, loadRows]);

  useEffect(() => {
    if (authLoading || profile?.role !== 'admin') return;

    let cancelled = false;
    async function loadDefaultNetwork() {
      const token = await getAccessToken();
      if (!token || cancelled) return;

      const result = await getOnrampWithdrawNetworkAction(token);
      if (!result.ok || cancelled) return;
      setNetwork(result.data.network);
    }

    void loadDefaultNetwork();
    return () => {
      cancelled = true;
    };
  }, [authLoading, profile?.role]);

  const resetForm = () => {
    setFormMode(null);
    setEditingId(null);
    setUserEmail('');
    setAddress('');
    void getAccessToken().then(async (token) => {
      if (!token) {
        setNetwork('STELLAR_TESTNET');
        return;
      }
      const result = await getOnrampWithdrawNetworkAction(token);
      setNetwork(result.ok ? result.data.network : 'STELLAR_TESTNET');
    });
    setLabel('');
    setMemo('');
    setFormError(null);
  };

  const openCreate = () => {
    resetForm();
    setFormMode('create');
    setSuccessMessage(null);
  };

  const openEdit = (row: EditableRow) => {
    setFormMode('edit');
    setEditingId(row.id);
    setUserEmail(row.user_email ?? '');
    setAddress(row.address);
    setNetwork(row.network);
    setLabel(row.label ?? '');
    setMemo(row.memo ?? '');
    setFormError(null);
    setSuccessMessage(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);
    setIsSaving(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        setFormError(t('pages.userManagement.errors.session'));
        return;
      }

      const result = await upsertWithdrawWhitelistAction(token, {
        id: formMode === 'edit' ? editingId ?? undefined : undefined,
        userEmail,
        address,
        network,
        label,
        memo,
        isActive: true,
      });

      if (!result.ok) {
        setFormError(
          result.message === 'User not found in panel access list.'
            ? t('pages.withdrawWhitelist.errors.userNotFound')
            : result.message,
        );
        return;
      }

      setSuccessMessage(
        formMode === 'edit'
          ? t('pages.withdrawWhitelist.updateSuccess')
          : t('pages.withdrawWhitelist.createSuccess'),
      );

      resetForm();
      await loadRows();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (row: EditableRow) => {
    setFormError(null);
    setSuccessMessage(null);

    const confirmed = window.confirm(
      t('pages.withdrawWhitelist.deleteConfirm').replace('{{address}}', row.address),
    );
    if (!confirmed) return;

    setIsSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setFormError(t('pages.userManagement.errors.session'));
        return;
      }

      const result = await deleteWithdrawWhitelistAction(token, row.id);
      if (!result.ok) {
        setFormError(result.message);
        return;
      }

      if (editingId === row.id) {
        resetForm();
      }
      setSuccessMessage(t('pages.withdrawWhitelist.deleteSuccess'));
      await loadRows();
    } finally {
      setIsSaving(false);
    }
  };

  if (authLoading || profile?.role !== 'admin') {
    return (
      <section className="dashboard-layout">
        <article className="surface">
          <p className="surface__lead">{t('pages.withdrawWhitelist.loading')}</p>
        </article>
      </section>
    );
  }

  return (
    <section className="dashboard-layout">
      <article className="surface user-management-card">
        <div className="user-management-card__header">
          <div>
            <p className="eyebrow">{t('pages.withdrawWhitelist.eyebrow')}</p>
            <div className="onramp-inline-actions" role="tablist" aria-label={t('pages.withdrawWhitelist.tabsLabel')}>
              <Button
                type="button"
                role="tab"
                variant={activeTab === 'wallets' ? 'primary' : 'secondary'}
                aria-selected={activeTab === 'wallets'}
                onClick={() => setActiveTab('wallets')}
              >
                {t('pages.withdrawWhitelist.tabs.wallets')}
              </Button>
              <Button
                type="button"
                role="tab"
                variant={activeTab === 'pix' ? 'primary' : 'secondary'}
                aria-selected={activeTab === 'pix'}
                onClick={() => setActiveTab('pix')}
              >
                {t('pages.withdrawWhitelist.tabs.pix')}
              </Button>
            </div>
          </div>
          {activeTab === 'wallets' ? (
            <Button type="button" variant="secondary" onClick={openCreate} disabled={isSaving}>
              {t('pages.withdrawWhitelist.addWallet')}
            </Button>
          ) : null}
        </div>

        <p className="surface__lead api-cross-link">
          {t('pages.apiIntegration.crossLinks.whitelist')}{' '}
          <Link href="/app/api-integration">{t('pages.apiIntegration.crossLinks.whitelistLink')}</Link>
        </p>

        {activeTab === 'pix' ? <UserPixWhitelistPanel isActive /> : null}

        {activeTab === 'wallets' ? (
          <>
        {loadError ? (
          <p className="auth-inline-error" role="alert">
            {loadError}
          </p>
        ) : null}

        {formError ? (
          <p className="auth-inline-error" role="alert">
            {formError}
          </p>
        ) : null}

        {successMessage ? (
          <p className="form-success-message" role="status">
            {successMessage}
          </p>
        ) : null}

        {rows.length === 0 && !isLoading ? (
          <p className="surface__lead">{t('pages.withdrawWhitelist.empty')}</p>
        ) : null}

        {rows.length > 0 ? (
          <div className="user-management-table-wrap">
            <table className="user-management-table">
              <thead>
                <tr>
                  <th scope="col">{t('pages.withdrawWhitelist.columns.user')}</th>
                  <th scope="col">{t('pages.withdrawWhitelist.columns.address')}</th>
                  <th scope="col">{t('pages.withdrawWhitelist.columns.network')}</th>
                  <th scope="col">{t('pages.withdrawWhitelist.columns.label')}</th>
                  <th scope="col">{t('pages.withdrawWhitelist.columns.memo')}</th>
                  <th scope="col">{t('pages.withdrawWhitelist.columns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.user_email ?? '—'}</td>
                    <td>{row.address}</td>
                    <td>{row.network}</td>
                    <td>{row.label ?? '—'}</td>
                    <td>{row.memo ?? '—'}</td>
                    <td>
                      <div className="user-management-actions">
                        <Button type="button" variant="ghost" onClick={() => openEdit(row)}>
                          {t('pages.userManagement.edit')}
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => void handleDelete(row)} disabled={isSaving}>
                          {t('pages.userManagement.delete')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {formMode ? (
          <section className="user-management-form">
            <h2 className="user-management-form__title">
              {formMode === 'create'
                ? t('pages.withdrawWhitelist.formCreateTitle')
                : t('pages.withdrawWhitelist.formEditTitle')}
            </h2>
            <form className="withdraw-whitelist-form" onSubmit={handleSubmit}>
              <label className="field">
                <span className="field__label">{t('pages.withdrawWhitelist.userEmail')}</span>
                <select
                  className="field__input field__select"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  required
                  disabled={isSaving || userOptions.length === 0}
                >
                  <option value="">
                    {t('pages.withdrawWhitelist.userEmailPlaceholder')}
                  </option>
                  {userOptions.map((email) => (
                    <option key={email} value={email}>
                      {email}
                    </option>
                  ))}
                </select>
              </label>
              <div className="withdraw-whitelist-form__address-row">
                <InputField
                  id="whitelist-address"
                  label={t('pages.withdrawWhitelist.address')}
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={t('pages.withdrawWhitelist.addressPlaceholder')}
                  required
                />
                <label className="field">
                  <span className="field__label">{t('pages.withdrawWhitelist.network')}</span>
                  <select
                    className="field__input field__select"
                    value={network}
                    disabled
                    aria-readonly="true"
                  >
                    <option value={network}>{network}</option>
                  </select>
                  <span className="field__hint">{t('pages.withdrawWhitelist.networkOnrampHint')}</span>
                </label>
              </div>
              <InputField
                id="whitelist-label"
                label={t('pages.withdrawWhitelist.label')}
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t('pages.withdrawWhitelist.labelPlaceholder')}
              />
              <InputField
                id="whitelist-memo"
                label={t('pages.withdrawWhitelist.memo')}
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder={t('pages.withdrawWhitelist.memoPlaceholder')}
                maxLength={28}
              />
              <div className="user-management-form__actions">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? t('pages.userManagement.saving') : t('pages.userManagement.save')}
                </Button>
                <Button type="button" variant="ghost" disabled={isSaving} onClick={resetForm}>
                  {t('pages.userManagement.cancel')}
                </Button>
              </div>
            </form>
          </section>
        ) : null}
          </>
        ) : null}
      </article>
    </section>
  );
}

