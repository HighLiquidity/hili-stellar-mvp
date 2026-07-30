'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import {
  cancelWithdrawWhitelistRequestAction,
  deleteWithdrawWhitelistAction,
  listMyWithdrawWhitelistAction,
  listWithdrawWhitelistAction,
  listWhitelistUsersAction,
  submitWithdrawWhitelistRequestAction,
  upsertWithdrawWhitelistAction,
} from '@/app/actions/withdraw-whitelist';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useI18n } from '@/lib/i18n';
import { isOperatorOrAdminRole, canApproveWhitelist } from '@/lib/users/panel-access';
import type { WhitelistApprovalStatus } from '@/lib/whitelist/approval';
import { UserPixWhitelistPanel } from '@/views/UserPixWhitelistPanel';
import { WhitelistPendingPanel } from '@/views/WhitelistPendingPanel';
import type { WithdrawWhitelistRow } from '@/lib/withdraw-whitelist/types';
import { shouldOfferWithdrawWhitelistMemo } from '@/lib/withdraw-whitelist/onramp-network';

type WhitelistTab = 'wallets' | 'pix' | 'pending';

type FormMode = 'create' | 'edit' | null;

type EditableRow = WithdrawWhitelistRow & {
  user_email?: string | null;
};

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function formatApprovalStatus(
  status: WhitelistApprovalStatus,
  t: (key: string) => string,
): string {
  if (status === 'pending') return t('pages.whitelistApproval.status.pending');
  if (status === 'rejected') return t('pages.whitelistApproval.status.rejected');
  return t('pages.whitelistApproval.status.approved');
}

export function UserWithdrawWhitelistPage() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, isLoading: authLoading, isAuthorized } = useAuth();
  const isPlatformAdmin = profile?.role === 'admin';
  const isClientAdmin = profile?.role === 'client_admin';
  const canApprove = canApproveWhitelist(profile?.role);
  const canAccess = isOperatorOrAdminRole(profile?.role) || canApprove;

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
  const [label, setLabel] = useState('');
  const [memo, setMemo] = useState('');
  const initialTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<WhitelistTab>(
    initialTab === 'pending' || initialTab === 'pix' || initialTab === 'wallets'
      ? initialTab
      : 'wallets',
  );
  const [pixCreateRequested, setPixCreateRequested] = useState(0);
  const [pixIsSaving, setPixIsSaving] = useState(false);

  const showMemoField = shouldOfferWithdrawWhitelistMemo(address);

  const visibleTabs = useMemo<WhitelistTab[]>(() => {
    if (isPlatformAdmin) return ['wallets', 'pix', 'pending'];
    if (isClientAdmin) return ['wallets', 'pix', 'pending'];
    return ['wallets', 'pix'];
  }, [isPlatformAdmin, isClientAdmin]);

  useEffect(() => {
    if (authLoading || !isAuthorized) return;
    if (!canAccess) {
      router.replace('/app/dashboard');
    }
  }, [authLoading, canAccess, isAuthorized, router]);

  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab(visibleTabs[0] ?? 'wallets');
    }
  }, [activeTab, visibleTabs]);

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

      if (isPlatformAdmin) {
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
      } else {
        const rowsResult = await listMyWithdrawWhitelistAction(token);
        if (!rowsResult.ok) {
          setLoadError(rowsResult.message);
          setRows([]);
        } else {
          setRows(rowsResult.data);
        }
        setUserOptions([]);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setRows([]);
      setUserOptions([]);
    } finally {
      setIsLoading(false);
    }
  }, [isPlatformAdmin, t]);

  useEffect(() => {
    if (authLoading || !canAccess) return;
    if (activeTab !== 'wallets') return;
    void loadRows();
  }, [authLoading, canAccess, activeTab, loadRows]);

  const resetForm = () => {
    setFormMode(null);
    setEditingId(null);
    setUserEmail('');
    setAddress('');
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
    setLabel(row.label ?? '');
    setMemo(row.memo ?? '');
    setFormError(null);
    setSuccessMessage(null);
  };

  const mapSubmitError = (message: string): string => {
    if (message === 'User not found in panel access list.') {
      return t('pages.withdrawWhitelist.errors.userNotFound');
    }
    if (message === 'Wallet already whitelisted.') {
      return t('pages.whitelistApproval.errors.alreadyWhitelisted');
    }
    if (message === 'Wallet request already pending approval.') {
      return t('pages.whitelistApproval.errors.alreadyPending');
    }
    return message;
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

      if (isPlatformAdmin) {
        const result = await upsertWithdrawWhitelistAction(token, {
          id: formMode === 'edit' ? editingId ?? undefined : undefined,
          userEmail,
          address,
          label,
          memo: showMemoField ? memo : null,
          isActive: true,
        });

        if (!result.ok) {
          setFormError(mapSubmitError(result.message));
          return;
        }

        setSuccessMessage(
          formMode === 'edit'
            ? t('pages.withdrawWhitelist.updateSuccess')
            : t('pages.withdrawWhitelist.createSuccess'),
        );
      } else {
        const result = await submitWithdrawWhitelistRequestAction(token, {
          address,
          label,
          memo: showMemoField ? memo : null,
        });

        if (!result.ok) {
          setFormError(mapSubmitError(result.message));
          return;
        }

        setSuccessMessage(t('pages.whitelistApproval.requestSubmitted'));
      }

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

  const handleCancelRequest = async (row: EditableRow) => {
    setFormError(null);
    setSuccessMessage(null);

    const confirmed = window.confirm(t('pages.whitelistApproval.cancelConfirm'));
    if (!confirmed) return;

    setIsSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setFormError(t('pages.userManagement.errors.session'));
        return;
      }

      const result = await cancelWithdrawWhitelistRequestAction(token, row.id);
      if (!result.ok) {
        setFormError(result.message);
        return;
      }

      setSuccessMessage(t('pages.whitelistApproval.cancelSuccess'));
      await loadRows();
    } finally {
      setIsSaving(false);
    }
  };

  if (authLoading || !canAccess) {
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
          <p className="eyebrow">{isPlatformAdmin ? t('pages.withdrawWhitelist.eyebrow') : t('pages.whitelistApproval.operatorEyebrow')}</p>
          <div className="user-management-card__toolbar">
            <div className="onramp-inline-actions" role="tablist" aria-label={t('pages.withdrawWhitelist.tabsLabel')}>
              {visibleTabs.map((tab) => (
                <Button
                  key={tab}
                  type="button"
                  role="tab"
                  variant={activeTab === tab ? 'primary' : 'secondary'}
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === 'wallets'
                    ? t('pages.withdrawWhitelist.tabs.wallets')
                    : tab === 'pix'
                      ? t('pages.withdrawWhitelist.tabs.pix')
                      : t('pages.whitelistApproval.tabs.pending')}
                </Button>
              ))}
            </div>
            {activeTab === 'wallets' ? (
              <Button type="button" variant="secondary" onClick={openCreate} disabled={isSaving}>
                {isPlatformAdmin ? t('pages.withdrawWhitelist.addWallet') : t('pages.whitelistApproval.requestWallet')}
              </Button>
            ) : null}
            {activeTab === 'pix' ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPixCreateRequested((count) => count + 1)}
                disabled={pixIsSaving}
              >
                {isPlatformAdmin ? t('pages.pixWhitelist.addKey') : t('pages.whitelistApproval.requestPixKey')}
              </Button>
            ) : null}
          </div>
        </div>

        <p className="surface__lead api-cross-link">
          {t('pages.apiIntegration.crossLinks.whitelist')}{' '}
          <Link href="/app/api-integration">{t('pages.apiIntegration.crossLinks.whitelistLink')}</Link>
        </p>

        {activeTab === 'pix' ? (
          <UserPixWhitelistPanel
            isActive
            mode={isPlatformAdmin ? 'admin' : 'operator'}
            createRequested={pixCreateRequested}
            onSavingChange={setPixIsSaving}
          />
        ) : null}

        {activeTab === 'pending' && canApprove ? <WhitelistPendingPanel isActive /> : null}

        {activeTab === 'wallets' ? (
          <>
            {!isPlatformAdmin ? <p className="surface__lead">{t('pages.whitelistApproval.operatorWalletHint')}</p> : null}

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
                      {isPlatformAdmin ? <th scope="col">{t('pages.withdrawWhitelist.columns.user')}</th> : null}
                      <th scope="col">{t('pages.withdrawWhitelist.columns.address')}</th>
                      <th scope="col">{t('pages.withdrawWhitelist.columns.network')}</th>
                      <th scope="col">{t('pages.withdrawWhitelist.columns.label')}</th>
                      <th scope="col">{t('pages.withdrawWhitelist.columns.memo')}</th>
                      {!isPlatformAdmin ? <th scope="col">{t('pages.whitelistApproval.columns.status')}</th> : null}
                      <th scope="col">{t('pages.withdrawWhitelist.columns.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        {isPlatformAdmin ? <td>{row.user_email ?? '—'}</td> : null}
                        <td>{row.address}</td>
                        <td>{row.network}</td>
                        <td>{row.label ?? '—'}</td>
                        <td>{row.memo ?? '—'}</td>
                        {!isPlatformAdmin ? (
                          <td>
                            <span className={`whitelist-status whitelist-status--${row.approval_status}`}>
                              {formatApprovalStatus(row.approval_status, t)}
                            </span>
                            {row.approval_status === 'rejected' && row.rejection_reason ? (
                              <span className="field__hint"> — {row.rejection_reason}</span>
                            ) : null}
                          </td>
                        ) : null}
                        <td>
                          <div className="user-management-actions">
                            {isPlatformAdmin ? (
                              <>
                                <Button type="button" variant="ghost" onClick={() => openEdit(row)}>
                                  {t('pages.userManagement.edit')}
                                </Button>
                                <Button type="button" variant="ghost" onClick={() => void handleDelete(row)} disabled={isSaving}>
                                  {t('pages.userManagement.delete')}
                                </Button>
                              </>
                            ) : row.approval_status === 'pending' ? (
                              <Button type="button" variant="ghost" onClick={() => void handleCancelRequest(row)} disabled={isSaving}>
                                {t('pages.whitelistApproval.cancelRequest')}
                              </Button>
                            ) : row.approval_status === 'rejected' ? (
                              <Button type="button" variant="ghost" onClick={openCreate} disabled={isSaving}>
                                {t('pages.whitelistApproval.requestAgain')}
                              </Button>
                            ) : (
                              <span>—</span>
                            )}
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
                  {isPlatformAdmin
                    ? formMode === 'create'
                      ? t('pages.withdrawWhitelist.formCreateTitle')
                      : t('pages.withdrawWhitelist.formEditTitle')
                    : t('pages.whitelistApproval.requestWallet')}
                </h2>
                <form className="withdraw-whitelist-form" onSubmit={handleSubmit}>
                  {isPlatformAdmin ? (
                    <label className="field">
                      <span className="field__label">{t('pages.withdrawWhitelist.userEmail')}</span>
                      <select
                        className="field__input field__select"
                        value={userEmail}
                        onChange={(e) => setUserEmail(e.target.value)}
                        required
                        disabled={isSaving || userOptions.length === 0}
                      >
                        <option value="">{t('pages.withdrawWhitelist.userEmailPlaceholder')}</option>
                        {userOptions.map((email) => (
                          <option key={email} value={email}>
                            {email}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <InputField
                    id="whitelist-address"
                    label={t('pages.withdrawWhitelist.address')}
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder={t('pages.withdrawWhitelist.addressPlaceholder')}
                    required
                    disabled={isSaving || (isPlatformAdmin && formMode === 'edit')}
                  />
                  <InputField
                    id="whitelist-label"
                    label={t('pages.withdrawWhitelist.label')}
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder={t('pages.withdrawWhitelist.labelPlaceholder')}
                  />
                  {showMemoField ? (
                    <InputField
                      id="whitelist-memo"
                      label={t('pages.withdrawWhitelist.memo')}
                      type="text"
                      value={memo}
                      onChange={(e) => setMemo(e.target.value)}
                      placeholder={t('pages.withdrawWhitelist.memoPlaceholder')}
                      maxLength={28}
                    />
                  ) : (
                    <p className="surface__hint">{t('pages.withdrawWhitelist.memoSorobanHint')}</p>
                  )}
                  <div className="user-management-form__actions">
                    <Button type="submit" disabled={isSaving}>
                      {isSaving
                        ? t('pages.userManagement.saving')
                        : isPlatformAdmin
                          ? t('pages.userManagement.save')
                          : t('pages.whitelistApproval.submitRequest')}
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
