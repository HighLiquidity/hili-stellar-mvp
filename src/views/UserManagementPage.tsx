'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  createPanelUserAction,
  deletePanelUserAction,
  listPanelUsersAction,
  updatePanelUserAction,
} from '@/app/actions/user-management';
import { listClientsAction } from '@/app/actions/clients';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { ClientRow } from '@/lib/clients/types';
import type { PanelUserRole, PanelUserRow } from '@/lib/users/types';
import { useI18n } from '@/lib/i18n';

type FormMode = 'create' | 'edit' | null;

const ROLES: PanelUserRole[] = ['admin', 'operator', 'viewer'];

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export function UserManagementPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { profile, user, isLoading: authLoading, isAuthorized } = useAuth();

  const [rows, setRows] = useState<PanelUserRow[]>([]);
  const [clientOptions, setClientOptions] = useState<ClientRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<PanelUserRole>('operator');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [clientId, setClientId] = useState('');

  useEffect(() => {
    if (authLoading || !isAuthorized) return;
    if (profile?.role !== 'admin') {
      router.replace('/app/dashboard');
    }
  }, [authLoading, isAuthorized, profile?.role, router]);

  const loadUsers = useCallback(async () => {
    setLoadError(null);
    setIsLoading(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        setLoadError(t('pages.userManagement.errors.session'));
        setRows([]);
        return;
      }

      const [usersResult, clientsResult] = await Promise.all([
        listPanelUsersAction(token),
        listClientsAction(token),
      ]);

      if (!usersResult.ok) {
        setLoadError(usersResult.message);
        setRows([]);
      } else {
        setRows(usersResult.data);
      }

      if (!clientsResult.ok) {
        setClientOptions([]);
      } else {
        setClientOptions(clientsResult.data);
      }
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (authLoading || profile?.role !== 'admin') return;
    void loadUsers();
  }, [authLoading, profile?.role, loadUsers]);

  const resetForm = () => {
    setFormMode(null);
    setEditingEmail(null);
    setEmail('');
    setFullName('');
    setRole('operator');
    setPassword('');
    setIsActive(true);
    setClientId('');
    setFormError(null);
  };

  const openCreate = () => {
    resetForm();
    setFormMode('create');
    setSuccessMessage(null);
    if (clientOptions[0]) {
      setClientId(clientOptions[0].id);
    }
  };

  const openEdit = (row: PanelUserRow) => {
    setFormMode('edit');
    setEditingEmail(row.email);
    setEmail(row.email);
    setFullName(row.full_name?.trim() ?? '');
    setRole(row.role);
    setPassword('');
    setIsActive(row.is_active);
    setClientId(row.client_id ?? '');
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

      if (formMode === 'create') {
        const result = await createPanelUserAction(token, {
          email,
          fullName,
          role,
          password,
          isActive: true,
          clientId: role === 'admin' ? undefined : clientId,
        });
        if (!result.ok) {
          setFormError(result.message);
          return;
        }
        setSuccessMessage(t('pages.userManagement.createSuccess'));
        resetForm();
      } else if (formMode === 'edit' && editingEmail) {
        const result = await updatePanelUserAction(token, editingEmail, {
          fullName,
          role,
          password: password || undefined,
          isActive,
          clientId: role === 'admin' ? undefined : clientId,
        });
        if (!result.ok) {
          setFormError(result.message);
          return;
        }
        setSuccessMessage(t('pages.userManagement.updateSuccess'));
        resetForm();
      }

      await loadUsers();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (row: PanelUserRow) => {
    const confirmed = window.confirm(
      t('pages.userManagement.deleteConfirm').replace('{{email}}', row.email),
    );
    if (!confirmed) return;

    setFormError(null);
    setSuccessMessage(null);
    setIsSaving(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        setFormError(t('pages.userManagement.errors.session'));
        return;
      }

      const result = await deletePanelUserAction(token, row.email);
      if (!result.ok) {
        setFormError(result.message);
        return;
      }

      if (editingEmail === row.email) {
        resetForm();
      }

      setSuccessMessage(t('pages.userManagement.deleteSuccess'));
      await loadUsers();
    } finally {
      setIsSaving(false);
    }
  };

  const roleLabel = (value: PanelUserRole) => t(`pages.userManagement.roles.${value}`);

  if (authLoading || profile?.role !== 'admin') {
    return (
      <section className="dashboard-layout">
        <article className="surface">
          <p className="surface__lead">{t('pages.userManagement.loading')}</p>
        </article>
      </section>
    );
  }

  return (
    <section className="dashboard-layout">
      <article className="surface user-management-card">
        <div className="user-management-card__header">
          <div>
            <p className="eyebrow">{t('pages.userManagement.eyebrow')}</p>
          </div>
          <Button type="button" variant="secondary" onClick={openCreate} disabled={isSaving}>
            {t('pages.userManagement.addUser')}
          </Button>
        </div>

        <p className="surface__lead api-cross-link">
          {t('pages.apiIntegration.crossLinks.users')}{' '}
          <Link href="/app/api-integration">{t('pages.apiIntegration.crossLinks.usersLink')}</Link>
        </p>

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

        {formMode ? (
          <form className="user-management-form" onSubmit={handleSubmit}>
            <h3 className="user-management-form__title">
              {formMode === 'create'
                ? t('pages.userManagement.formCreateTitle')
                : t('pages.userManagement.formEditTitle')}
            </h3>

            <InputField
              id="user-email"
              label={t('pages.userManagement.email')}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('pages.userManagement.emailPlaceholder')}
              autoComplete="off"
              required
              disabled={formMode === 'edit' || isSaving}
            />

            <div className="user-management-form__name-role-row">
              <InputField
                id="user-full-name"
                label={t('pages.userManagement.fullName')}
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t('pages.userManagement.fullNamePlaceholder')}
                autoComplete="name"
                required
                disabled={isSaving}
              />

              <label className="field">
                <span className="field__label">{t('pages.userManagement.role')}</span>
                <select
                  className="field__input field__select"
                  value={role}
                  onChange={(e) => {
                    const nextRole = e.target.value as PanelUserRole;
                    setRole(nextRole);
                    if (nextRole === 'admin') {
                      setClientId('');
                    } else if (!clientId && clientOptions[0]) {
                      setClientId(clientOptions[0].id);
                    }
                  }}
                  disabled={isSaving}
                  required
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {roleLabel(r)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {role !== 'admin' ? (
              <label className="field">
                <span className="field__label">{t('pages.userManagement.client')}</span>
                <select
                  className="field__input field__select"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  disabled={isSaving || clientOptions.length === 0}
                  required
                >
                  <option value="">{t('pages.userManagement.clientPlaceholder')}</option>
                  {clientOptions.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.trade_name?.trim() || client.legal_name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <InputField
              id="user-password"
              label={
                formMode === 'create'
                  ? t('pages.userManagement.password')
                  : t('pages.userManagement.passwordOptional')
              }
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('pages.userManagement.passwordPlaceholder')}
              autoComplete={formMode === 'create' ? 'new-password' : 'off'}
              required={formMode === 'create'}
              disabled={isSaving}
            />

            {formMode === 'edit' ? (
              <label className="user-management-checkbox">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  disabled={isSaving || editingEmail === user?.email?.toLowerCase()}
                />
                <span>{t('pages.userManagement.isActive')}</span>
              </label>
            ) : null}

            <div className="user-management-form__actions">
              <Button type="submit" disabled={isSaving}>
                {isSaving
                  ? t('pages.userManagement.saving')
                  : formMode === 'create'
                    ? t('pages.userManagement.create')
                    : t('pages.userManagement.save')}
              </Button>
              <Button type="button" variant="ghost" disabled={isSaving} onClick={resetForm}>
                {t('pages.userManagement.cancel')}
              </Button>
            </div>
          </form>
        ) : null}

        <div className="user-management-table-wrap">
          <table className="user-management-table">
            <thead>
              <tr>
                <th>{t('pages.userManagement.email')}</th>
                <th>{t('pages.userManagement.fullName')}</th>
                <th>{t('pages.userManagement.client')}</th>
                <th>{t('pages.userManagement.role')}</th>
                <th>{t('pages.userManagement.status')}</th>
                <th aria-label={t('pages.userManagement.actions')} />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6}>{t('pages.userManagement.loading')}</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>{t('pages.userManagement.empty')}</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.email}>
                    <td>{row.email}</td>
                    <td>{row.full_name?.trim() || '—'}</td>
                    <td>{row.client_name ?? (row.role === 'admin' ? '—' : t('pages.userManagement.clientMissing'))}</td>
                    <td>{roleLabel(row.role)}</td>
                    <td>
                      <span
                        className={`user-management-status${row.is_active ? ' is-active' : ' is-inactive'}`}
                      >
                        {row.is_active
                          ? t('pages.userManagement.statusActive')
                          : t('pages.userManagement.statusInactive')}
                      </span>
                    </td>
                    <td className="user-management-table__actions">
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={isSaving}
                        onClick={() => openEdit(row)}
                      >
                        {t('pages.userManagement.edit')}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={isSaving || row.email === user?.email?.toLowerCase()}
                        onClick={() => void handleDelete(row)}
                      >
                        {t('pages.userManagement.delete')}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
