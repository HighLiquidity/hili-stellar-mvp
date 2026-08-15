'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  cancelPixWhitelistRequestAction,
  deletePixWhitelistAction,
  listMyPixWhitelistAction,
  listPixWhitelistAction,
  submitPixWhitelistRequestAction,
  upsertPixWhitelistAction,
} from '@/app/actions/pix-whitelist';
import { listWhitelistUsersAction } from '@/app/actions/withdraw-whitelist';
import { PencilIcon, TrashIcon } from '@/components/Icons';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import { supabase } from '@/integrations/supabase/client';
import { useI18n } from '@/lib/i18n';
import type { PixWhitelistRow } from '@/lib/pix-whitelist/types';
import type { WhitelistApprovalStatus } from '@/lib/whitelist/approval';

type FormMode = 'create' | 'edit' | null;

type EditableRow = PixWhitelistRow & {
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

type UserPixWhitelistPanelProps = {
  isActive: boolean;
  mode: 'admin' | 'operator';
  createRequested?: number;
  onSavingChange?: (isSaving: boolean) => void;
};

export function UserPixWhitelistPanel({
  isActive,
  mode,
  createRequested = 0,
  onSavingChange,
}: UserPixWhitelistPanelProps) {
  const { t } = useI18n();
  const isAdmin = mode === 'admin';

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

      if (isAdmin) {
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
      } else {
        const rowsResult = await listMyPixWhitelistAction(token);
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
  }, [isAdmin, t]);

  useEffect(() => {
    if (!isActive) return;
    void loadRows();
  }, [isActive, loadRows]);

  useEffect(() => {
    onSavingChange?.(isSaving);
  }, [isSaving, onSavingChange]);

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

  useEffect(() => {
    if (!isActive || createRequested === 0) return;
    setFormMode('create');
    setEditingId(null);
    setUserEmail('');
    setPixKey('');
    setBeneficiaryName('');
    setLabel('');
    setFormError(null);
    setSuccessMessage(null);
  }, [createRequested, isActive]);

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

  const mapSubmitError = (message: string): string => {
    if (message === 'User not found in panel access list.') {
      return t('pages.pixWhitelist.errors.userNotFound');
    }
    if (message === 'PIX key already whitelisted.') {
      return t('pages.whitelistApproval.errors.alreadyWhitelisted');
    }
    if (message === 'PIX key request already pending approval.') {
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

      if (isAdmin) {
        const result = await upsertPixWhitelistAction(token, {
          id: formMode === 'edit' ? editingId ?? undefined : undefined,
          userEmail,
          pixKey,
          beneficiaryName,
          label,
          isActive: true,
        });

        if (!result.ok) {
          setFormError(mapSubmitError(result.message));
          return;
        }

        setSuccessMessage(
          formMode === 'edit' ? t('pages.pixWhitelist.updateSuccess') : t('pages.pixWhitelist.createSuccess'),
        );
      } else {
        const result = await submitPixWhitelistRequestAction(token, {
          pixKey,
          beneficiaryName,
          label,
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

      const result = await cancelPixWhitelistRequestAction(token, row.id);
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

  if (!isActive) {
    return null;
  }

  return (
    <>
      {!isAdmin ? (
        <p className="surface__lead">{t('pages.whitelistApproval.operatorPixHint')}</p>
      ) : null}

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
                {isAdmin ? <th scope="col">{t('pages.pixWhitelist.columns.user')}</th> : null}
                <th scope="col">{t('pages.pixWhitelist.columns.pixKey')}</th>
                <th scope="col">{t('pages.pixWhitelist.columns.beneficiary')}</th>
                <th scope="col">{t('pages.pixWhitelist.columns.label')}</th>
                {!isAdmin ? <th scope="col">{t('pages.whitelistApproval.columns.status')}</th> : null}
                <th scope="col">{t('pages.pixWhitelist.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {isAdmin ? <td>{row.user_email ?? '—'}</td> : null}
                  <td>{row.pix_key}</td>
                  <td>{row.beneficiary_name ?? '—'}</td>
                  <td>{row.label ?? '—'}</td>
                  {!isAdmin ? (
                    <td>
                      <span className={`whitelist-status whitelist-status--${row.approval_status}`}>
                        {formatApprovalStatus(row.approval_status, t)}
                      </span>
                      {row.approval_status === 'rejected' && row.rejection_reason ? (
                        <span className="field__hint"> — {row.rejection_reason}</span>
                      ) : null}
                    </td>
                  ) : null}
                  <td className="user-management-table__actions">
                    {isAdmin ? (
                      <>
                        <button
                          type="button"
                          className="icon-button"
                          disabled={isSaving}
                          onClick={() => openEdit(row)}
                          aria-label={t('pages.userManagement.edit')}
                          title={t('pages.userManagement.edit')}
                        >
                          <PencilIcon width={16} height={16} />
                        </button>
                        <button
                          type="button"
                          className="icon-button icon-button--danger"
                          disabled={isSaving}
                          onClick={() => void handleDelete(row)}
                          aria-label={t('pages.userManagement.delete')}
                          title={t('pages.userManagement.delete')}
                        >
                          <TrashIcon width={16} height={16} />
                        </button>
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
            {isAdmin
              ? formMode === 'create'
                ? t('pages.pixWhitelist.formCreateTitle')
                : t('pages.pixWhitelist.formEditTitle')
              : t('pages.whitelistApproval.requestPixKey')}
          </h2>
          <form className="withdraw-whitelist-form" onSubmit={handleSubmit}>
            {isAdmin ? (
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
            ) : null}
            <InputField
              id="pix-whitelist-key"
              label={t('pages.pixWhitelist.pixKey')}
              type="text"
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              placeholder={t('pages.pixWhitelist.pixKeyPlaceholder')}
              required
              disabled={isSaving || (isAdmin && formMode === 'edit')}
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
                {isSaving
                  ? t('pages.userManagement.saving')
                  : isAdmin
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
  );
}
