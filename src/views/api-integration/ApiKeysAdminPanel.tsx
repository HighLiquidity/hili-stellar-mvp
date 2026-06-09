'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import {
  createApiKeyAction,
  listApiKeysAction,
  revokeApiKeyAction,
} from '@/app/actions/api-keys';
import { listPanelUsersAction } from '@/app/actions/user-management';
import { ApiKeySecretReveal } from '@/components/ApiKeySecretReveal';
import { DevNotice } from '@/components/DevNotice';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { ApiKeyRow, ApiKeyScope } from '@/lib/api-keys/types';
import { useI18n } from '@/lib/i18n';
import type { PanelUserRow } from '@/lib/users/types';

const SCOPES: ApiKeyScope[] = ['onramp', 'offramp', 'orders:read'];

type FormMode = 'create' | null;

type RevealState = {
  keyPrefix: string;
  secret: string;
} | null;

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function translateApiKeyError(message: string, t: (key: string) => string): string {
  if (/linked operator user was not found in auth/i.test(message)) {
    return t('pages.apiIntegration.keys.errors.operatorNotInAuth');
  }
  if (/api_keys|relation.*does not exist/i.test(message)) {
    return t('pages.apiIntegration.keys.errors.tableMissing');
  }
  return message;
}

function formatDateTime(value: string | null, locale: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function ApiKeysAdminPanel() {
  const { t, locale } = useI18n();
  const { profile } = useAuth();

  const [rows, setRows] = useState<ApiKeyRow[]>([]);
  const [operators, setOperators] = useState<PanelUserRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingOperators, setIsLoadingOperators] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [reveal, setReveal] = useState<RevealState>(null);

  const [label, setLabel] = useState('');
  const [linkedUserEmail, setLinkedUserEmail] = useState('');
  const [spreadBpsOverride, setSpreadBpsOverride] = useState('');
  const [maxAmountBrl, setMaxAmountBrl] = useState('');
  const [scopes, setScopes] = useState<ApiKeyScope[]>(['onramp', 'offramp', 'orders:read']);

  const operatorOptions = useMemo(
    () =>
      operators
        .filter((row) => row.is_active && (row.role === 'operator' || row.role === 'admin'))
        .map((row) => row.email),
    [operators],
  );

  const loadKeys = useCallback(async () => {
    setLoadError(null);
    setIsLoading(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        setLoadError(t('pages.apiIntegration.keys.errors.session'));
        setRows([]);
        return;
      }

      const result = await listApiKeysAction(token);
      if (!result.ok) {
        setLoadError(result.message);
        setRows([]);
        return;
      }

      setRows(result.data);
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  const loadOperators = useCallback(async () => {
    setIsLoadingOperators(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        setOperators([]);
        return;
      }

      const result = await listPanelUsersAction(token);
      if (!result.ok) {
        setOperators([]);
        return;
      }

      setOperators(result.data);
    } finally {
      setIsLoadingOperators(false);
    }
  }, []);

  useEffect(() => {
    if (profile?.role !== 'admin') return;
    void loadKeys();
    void loadOperators();
  }, [loadKeys, loadOperators, profile?.role]);

  useEffect(() => {
    if (formMode !== 'create' || operatorOptions.length === 0) return;

    setLinkedUserEmail((current) => {
      const normalized = current.trim().toLowerCase();
      const isValid =
        normalized.length > 0 &&
        operatorOptions.some((email) => email.trim().toLowerCase() === normalized);
      return isValid ? current : operatorOptions[0];
    });
  }, [formMode, operatorOptions]);

  const resetForm = () => {
    setFormMode(null);
    setLabel('');
    setSpreadBpsOverride('');
    setMaxAmountBrl('');
    setScopes(['onramp', 'offramp', 'orders:read']);
    setFormError(null);
    if (operatorOptions[0]) {
      setLinkedUserEmail(operatorOptions[0]);
    }
  };

  const openCreate = () => {
    setFormMode('create');
    setFormError(null);
    setSuccessMessage(null);
    setLabel('');
    setSpreadBpsOverride('');
    setMaxAmountBrl('');
    setScopes(['onramp', 'offramp', 'orders:read']);
    setLinkedUserEmail(operatorOptions[0] ?? '');
  };

  const toggleScope = (scope: ApiKeyScope) => {
    setScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope],
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    const trimmedLabel = label.trim();
    const trimmedEmail = linkedUserEmail.trim().toLowerCase();

    if (!trimmedLabel) {
      setFormError(t('pages.apiIntegration.keys.errors.labelRequired'));
      return;
    }

    if (!trimmedEmail) {
      setFormError(t('pages.apiIntegration.keys.errors.operatorRequired'));
      return;
    }

    if (scopes.length === 0) {
      setFormError(t('pages.apiIntegration.keys.errors.scopeRequired'));
      return;
    }

    setIsSaving(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        setFormError(t('pages.apiIntegration.keys.errors.session'));
        return;
      }

      const result = await createApiKeyAction(token, {
        label: trimmedLabel,
        linkedUserEmail: trimmedEmail,
        scopes,
        spreadBpsOverride: spreadBpsOverride.trim() || undefined,
        maxAmountBrl: maxAmountBrl.trim() || undefined,
      });

      if (!result.ok) {
        setFormError(translateApiKeyError(result.message, t));
        return;
      }

      setReveal({
        keyPrefix: result.data.row.keyPrefix,
        secret: result.data.secret,
      });
      setSuccessMessage(t('pages.apiIntegration.keys.createSuccess'));
      resetForm();
      await loadKeys();
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevoke = async (row: ApiKeyRow) => {
    const confirmed = window.confirm(
      t('pages.apiIntegration.keys.revokeConfirm').replace('{{label}}', row.label),
    );
    if (!confirmed) return;

    setFormError(null);
    setSuccessMessage(null);
    setIsSaving(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        setFormError(t('pages.apiIntegration.keys.errors.session'));
        return;
      }

      const result = await revokeApiKeyAction(token, row.id);
      if (!result.ok) {
        setFormError(result.message);
        return;
      }

      setSuccessMessage(t('pages.apiIntegration.keys.revokeSuccess'));
      await loadKeys();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="api-integration-panel">
      <DevNotice
        title={t('pages.apiIntegration.keys.devNoticePersisted.title')}
        badge={t('pages.apiIntegration.keys.devNoticePersisted.badge')}
        variant="info"
      >
        <p>{t('pages.apiIntegration.keys.devNoticePersisted.body')}</p>
      </DevNotice>

      <div className="api-integration-panel__toolbar">
        <Button
          type="button"
          variant="secondary"
          onClick={openCreate}
          disabled={isSaving || isLoadingOperators || operatorOptions.length === 0}
        >
          {t('pages.apiIntegration.keys.addKey')}
        </Button>
      </div>

      {!isLoadingOperators && operatorOptions.length === 0 ? (
        <p className="surface__lead">{t('pages.apiIntegration.keys.errors.noOperatorsAvailable')}</p>
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

      {reveal ? (
        <ApiKeySecretReveal
          keyPrefix={reveal.keyPrefix}
          secret={reveal.secret}
          onClose={() => setReveal(null)}
        />
      ) : null}

      {isLoading ? (
        <p className="surface__lead">{t('pages.apiIntegration.keys.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="surface__lead">{t('pages.apiIntegration.keys.empty')}</p>
      ) : (
        <div className="user-management-table-wrap">
          <table className="user-management-table">
            <thead>
              <tr>
                <th scope="col">{t('pages.apiIntegration.keys.columns.label')}</th>
                <th scope="col">{t('pages.apiIntegration.keys.columns.prefix')}</th>
                <th scope="col">{t('pages.apiIntegration.keys.columns.operator')}</th>
                <th scope="col">{t('pages.apiIntegration.keys.columns.scopes')}</th>
                <th scope="col">{t('pages.apiIntegration.keys.columns.status')}</th>
                <th scope="col">{t('pages.apiIntegration.keys.columns.lastUsed')}</th>
                <th scope="col">{t('pages.apiIntegration.keys.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.label}</td>
                  <td>
                    <code>{row.keyPrefix}</code>
                  </td>
                  <td>{row.linkedUserEmail}</td>
                  <td>{row.scopes.map((scope) => t(`pages.apiIntegration.keys.scopes.${scope}`)).join(', ')}</td>
                  <td>
                    {row.isActive
                      ? t('pages.apiIntegration.keys.statusActive')
                      : t('pages.apiIntegration.keys.statusRevoked')}
                  </td>
                  <td>{formatDateTime(row.lastUsedAt, locale)}</td>
                  <td>
                    {row.isActive ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => void handleRevoke(row)}
                        disabled={isSaving}
                      >
                        {t('pages.apiIntegration.keys.revoke')}
                      </Button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formMode === 'create' ? (
        <section className="user-management-form api-key-create-form">
          <h2 className="user-management-form__title">{t('pages.apiIntegration.keys.formCreateTitle')}</h2>
          <form className="api-key-create-form__form" onSubmit={(event) => void handleSubmit(event)}>
            <div className="api-key-form__two-col-row">
              <InputField
                id="api-key-label"
                label={t('pages.apiIntegration.keys.label')}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={t('pages.apiIntegration.keys.labelPlaceholder')}
                disabled={isSaving}
              />

              <label className="field" htmlFor="api-key-operator">
                <span className="field__label">{t('pages.apiIntegration.keys.operator')}</span>
                <select
                  id="api-key-operator"
                  className="field__input field__select"
                  value={linkedUserEmail}
                  onChange={(event) => setLinkedUserEmail(event.target.value)}
                  disabled={isSaving || isLoadingOperators}
                >
                  {operatorOptions.length === 0 ? (
                    <option value="">{t('pages.apiIntegration.keys.noOperators')}</option>
                  ) : (
                    operatorOptions.map((email) => (
                      <option key={email} value={email}>
                        {email}
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>

            <fieldset className="api-key-scopes-fieldset">
              <legend>{t('pages.apiIntegration.keys.scopesLegend')}</legend>
              {SCOPES.map((scope) => (
                <label key={scope} className="api-key-scopes-fieldset__item">
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                    disabled={isSaving}
                  />
                  <span>{t(`pages.apiIntegration.keys.scopes.${scope}`)}</span>
                </label>
              ))}
            </fieldset>

            <div className="api-key-form__two-col-row">
              <InputField
                id="api-key-spread"
                label={t('pages.apiIntegration.keys.spreadOverride')}
                value={spreadBpsOverride}
                onChange={(event) => setSpreadBpsOverride(event.target.value)}
                placeholder={t('pages.apiIntegration.keys.spreadOverridePlaceholder')}
                disabled={isSaving}
              />

              <InputField
                id="api-key-limit"
                label={t('pages.apiIntegration.keys.maxAmountBrl')}
                value={maxAmountBrl}
                onChange={(event) => setMaxAmountBrl(event.target.value)}
                placeholder={t('pages.apiIntegration.keys.maxAmountBrlPlaceholder')}
                disabled={isSaving}
              />
            </div>

            <div className="user-management-form__actions api-key-form__actions">
              <Button
                type="submit"
                variant="primary"
                disabled={isSaving || isLoadingOperators || operatorOptions.length === 0 || !linkedUserEmail.trim()}
              >
                {isSaving ? t('pages.apiIntegration.keys.saving') : t('pages.apiIntegration.keys.create')}
              </Button>
              <Button type="button" variant="secondary" onClick={resetForm} disabled={isSaving}>
                {t('pages.apiIntegration.keys.cancel')}
              </Button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
