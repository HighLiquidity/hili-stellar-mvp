'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  deletePixWhitelistAction,
  listPixWhitelistAction,
  upsertPixWhitelistAction,
} from '@/app/actions/pix-whitelist';
import { listWhitelistUsersAction } from '@/app/actions/withdraw-whitelist';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import { supabase } from '@/integrations/supabase/client';
import { useI18n } from '@/lib/i18n';
import type { PixWhitelistRow } from '@/lib/pix-whitelist/types';

type FormMode = 'create' | 'edit' | null;

type EditableRow = PixWhitelistRow & {
  user_email: string | null;
};

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

type UserPixWhitelistPanelProps = {
  isActive: boolean;
};

export function UserPixWhitelistPanel({ isActive }: UserPixWhitelistPanelProps) {
  const { t } = useI18n();

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
  const [pixKey, setPixKey] = useState('');
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [label, setLabel] = useState('');

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
        listPixWhitelistAction(token),
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
    if (!isActive) return;
    void loadRows();
  }, [isActive, loadRows]);

  const resetForm = () => {
    setFormMode(null);
    setEditingId(null);
    setUserEmail('');
    setPixKey('');
    setBeneficiaryName('');
    setLabel('');
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
    setPixKey(row.pix_key);
    setBeneficiaryName(row.beneficiary_name ?? '');
    setLabel(row.label ?? '');
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

      const result = await upsertPixWhitelistAction(token, {
        id: formMode === 'edit' ? editingId ?? undefined : undefined,
        userEmail,
        pixKey,
        beneficiaryName,
        label,
        isActive: true,
      });

      if (!result.ok) {
        setFormError(
          result.message === 'User not found in panel access list.'
            ? t('pages.pixWhitelist.errors.userNotFound')
            : result.message,
        );
        return;
      }

      setSuccessMessage(
        formMode === 'edit' ? t('pages.pixWhitelist.updateSuccess') : t('pages.pixWhitelist.createSuccess'),
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
      t('pages.pixWhitelist.deleteConfirm').replace('{{pixKey}}', row.pix_key),
    );
    if (!confirmed) return;

    setIsSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setFormError(t('pages.userManagement.errors.session'));
        return;
      }

      const result = await deletePixWhitelistAction(token, row.id);
      if (!result.ok) {
        setFormError(result.message);
        return;
      }

      if (editingId === row.id) {
        resetForm();
      }
      setSuccessMessage(t('pages.pixWhitelist.deleteSuccess'));
      await loadRows();
    } finally {
      setIsSaving(false);
    }
  };

  if (!isActive) {
    return null;
  }

  return (
    <>
      <div className="user-management-card__header">
        <div />
        <Button type="button" variant="secondary" onClick={openCreate} disabled={isSaving}>
          {t('pages.pixWhitelist.addKey')}
        </Button>
      </div>

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

      {rows.length === 0 && !isLoading ? <p className="surface__lead">{t('pages.pixWhitelist.empty')}</p> : null}

      {rows.length > 0 ? (
        <div className="user-management-table-wrap">
          <table className="user-management-table">
            <thead>
              <tr>
                <th scope="col">{t('pages.pixWhitelist.columns.user')}</th>
                <th scope="col">{t('pages.pixWhitelist.columns.pixKey')}</th>
                <th scope="col">{t('pages.pixWhitelist.columns.beneficiary')}</th>
                <th scope="col">{t('pages.pixWhitelist.columns.label')}</th>
                <th scope="col">{t('pages.pixWhitelist.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.user_email ?? '—'}</td>
                  <td>{row.pix_key}</td>
                  <td>{row.beneficiary_name ?? '—'}</td>
                  <td>{row.label ?? '—'}</td>
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
            {formMode === 'create' ? t('pages.pixWhitelist.formCreateTitle') : t('pages.pixWhitelist.formEditTitle')}
          </h2>
          <form className="withdraw-whitelist-form" onSubmit={handleSubmit}>
            <label className="field">
              <span className="field__label">{t('pages.pixWhitelist.userEmail')}</span>
              <select
                className="field__input field__select"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                required
                disabled={isSaving || userOptions.length === 0}
              >
                <option value="">{t('pages.pixWhitelist.userEmailPlaceholder')}</option>
                {userOptions.map((email) => (
                  <option key={email} value={email}>
                    {email}
                  </option>
                ))}
              </select>
            </label>
            <InputField
              id="pix-whitelist-key"
              label={t('pages.pixWhitelist.pixKey')}
              type="text"
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              placeholder={t('pages.pixWhitelist.pixKeyPlaceholder')}
              required
            />
            <InputField
              id="pix-whitelist-beneficiary"
              label={t('pages.pixWhitelist.beneficiaryName')}
              type="text"
              value={beneficiaryName}
              onChange={(e) => setBeneficiaryName(e.target.value)}
              placeholder={t('pages.pixWhitelist.beneficiaryNamePlaceholder')}
            />
            <InputField
              id="pix-whitelist-label"
              label={t('pages.pixWhitelist.label')}
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t('pages.pixWhitelist.labelPlaceholder')}
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
  );
}
