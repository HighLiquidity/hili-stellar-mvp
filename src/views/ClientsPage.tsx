'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import {
  createClientAction,
  listClientsAction,
  updateClientAction,
} from '@/app/actions/clients';
import {
  getClientComplianceAction,
  updateClientComplianceAction,
} from '@/app/actions/client-compliance';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import { ClientPlusIcon, PencilIcon } from '@/components/Icons';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { formatClientTaxId } from '@/lib/clients/format';
import { KYB_STATUSES, KYC_STATUSES, type KybStatus, type KycStatus } from '@/lib/clients/compliance-types';
import type { ClientRow, ClientStatus, ClientType } from '@/lib/clients/types';
import { CLIENT_STATUSES, CLIENT_TYPES } from '@/lib/clients/types';
import { useI18n } from '@/lib/i18n';

type FormMode = 'create' | 'edit' | null;

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export function ClientsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { profile, isLoading: authLoading, isAuthorized } = useAuth();

  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [clientType, setClientType] = useState<ClientType>('company');
  const [legalName, setLegalName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [status, setStatus] = useState<ClientStatus>('draft');
  const [spreadBpsOverride, setSpreadBpsOverride] = useState('');
  const [maxAmountBrl, setMaxAmountBrl] = useState('');
  const [kybStatus, setKybStatus] = useState<KybStatus>('not_started');
  const [kycStatus, setKycStatus] = useState<KycStatus>('not_started');
  const [complianceNotes, setComplianceNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    if (authLoading || !isAuthorized) return;
    if (profile?.role !== 'admin') {
      router.replace('/app/dashboard');
    }
  }, [authLoading, isAuthorized, profile?.role, router]);

  const loadClients = useCallback(async () => {
    setLoadError(null);
    setIsLoading(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        setLoadError(t('pages.clients.errors.session'));
        setRows([]);
        return;
      }

      const result = await listClientsAction(token);
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

  useEffect(() => {
    if (authLoading || profile?.role !== 'admin') return;
    void loadClients();
  }, [authLoading, profile?.role, loadClients]);

  const resetForm = () => {
    setFormMode(null);
    setEditingId(null);
    setClientType('company');
    setLegalName('');
    setTradeName('');
    setTaxId('');
    setContactEmail('');
    setStatus('draft');
    setSpreadBpsOverride('');
    setMaxAmountBrl('');
    setKybStatus('not_started');
    setKycStatus('not_started');
    setComplianceNotes('');
    setRejectionReason('');
    setFormError(null);
  };

  const openCreate = () => {
    resetForm();
    setFormMode('create');
    setSuccessMessage(null);
  };

  const openEdit = async (row: ClientRow) => {
    setFormMode('edit');
    setEditingId(row.id);
    setClientType(row.client_type);
    setLegalName(row.legal_name);
    setTradeName(row.trade_name ?? '');
    setTaxId(formatClientTaxId(row.tax_id));
    setContactEmail(row.contact_email ?? '');
    setStatus(row.status);
    setSpreadBpsOverride(row.spread_bps_override != null ? String(row.spread_bps_override) : '');
    setMaxAmountBrl(row.max_amount_brl ?? '');
    setKybStatus(row.kyb_status ?? 'not_started');
    setKycStatus(row.kyc_status ?? 'not_started');
    setComplianceNotes('');
    setRejectionReason('');
    setFormError(null);
    setSuccessMessage(null);

    const token = await getAccessToken();
    if (token) {
      const complianceResult = await getClientComplianceAction(token, row.id);
      if (complianceResult.ok) {
        setKybStatus(complianceResult.data.kyb_status);
        setKycStatus(complianceResult.data.kyc_status);
        setComplianceNotes(complianceResult.data.notes ?? '');
        setRejectionReason(complianceResult.data.rejection_reason ?? '');
      }
    }
  };

  const statusLabel = (value: ClientStatus) => t(`pages.clients.status.${value}`);
  const kybStatusLabel = (value: KybStatus) => t(`pages.clients.compliance.kyb.${value}`);
  const kycStatusLabel = (value: KycStatus) => t(`pages.clients.compliance.kyc.${value}`);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);
    setIsSaving(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        setFormError(t('pages.clients.errors.session'));
        return;
      }

      const payload = {
        legalName,
        tradeName,
        taxId,
        contactEmail,
        status,
        clientType,
        spreadBpsOverride,
        maxAmountBrl,
      };

      if (formMode === 'create') {
        const result = await createClientAction(token, payload);
        if (!result.ok) {
          setFormError(result.message);
          return;
        }
        setSuccessMessage(t('pages.clients.createSuccess'));
        resetForm();
      } else if (formMode === 'edit' && editingId) {
        const result = await updateClientAction(token, editingId, payload);
        if (!result.ok) {
          setFormError(result.message);
          return;
        }

        const complianceResult = await updateClientComplianceAction(token, editingId, {
          kybStatus,
          kycStatus,
          notes: complianceNotes,
          rejectionReason,
        });
        if (!complianceResult.ok) {
          setFormError(complianceResult.message);
          return;
        }

        setSuccessMessage(t('pages.clients.updateSuccess'));
        resetForm();
      }

      await loadClients();
    } finally {
      setIsSaving(false);
    }
  };

  if (authLoading || profile?.role !== 'admin') {
    return (
      <section className="dashboard-layout">
        <article className="surface">
          <p className="surface__lead">{t('pages.clients.loading')}</p>
        </article>
      </section>
    );
  }

  return (
    <section className="dashboard-layout">
      <article className="surface user-management-card">
        <div className="user-management-card__header">
          <div>
            <p className="eyebrow">{t('pages.clients.eyebrow')}</p>
            <h2 className="user-management-card__title">{t('pages.clients.title')}</h2>
          </div>
          <Button type="button" className="user-management-add" onClick={openCreate} disabled={isSaving}>
            <ClientPlusIcon width={16} height={16} />
            {t('pages.clients.addClient')}
          </Button>
        </div>

        <p className="surface__lead">{t('pages.clients.description')}</p>

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
              {formMode === 'create' ? t('pages.clients.formCreateTitle') : t('pages.clients.formEditTitle')}
            </h3>

            <fieldset className="field">
              <legend className="field__label">{t('pages.clients.clientTypeLabel')}</legend>
              <div className="field__radio-group">
                {CLIENT_TYPES.map((type) => (
                  <label key={type} className="field__radio">
                    <input
                      type="radio"
                      name="client-type"
                      value={type}
                      checked={clientType === type}
                      onChange={() => setClientType(type)}
                      disabled={isSaving || formMode === 'edit'}
                    />
                    <span>
                      {type === 'company'
                        ? t('pages.clients.clientTypeCompany')
                        : t('pages.clients.clientTypeIndividual')}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <InputField
              id="client-legal-name"
              label={t('pages.clients.legalName')}
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder={t('pages.clients.legalNamePlaceholder')}
              required
              disabled={isSaving}
            />

            {clientType === 'company' ? (
              <InputField
                id="client-trade-name"
                label={t('pages.clients.tradeName')}
                value={tradeName}
                onChange={(e) => setTradeName(e.target.value)}
                placeholder={t('pages.clients.tradeNamePlaceholder')}
                disabled={isSaving}
              />
            ) : null}

            <InputField
              id="client-tax-id"
              label={t('pages.clients.taxId')}
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder={t('pages.clients.taxIdPlaceholder')}
              required
              disabled={isSaving}
            />

            <InputField
              id="client-contact-email"
              label={t('pages.clients.contactEmail')}
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder={t('pages.clients.contactEmailPlaceholder')}
              disabled={isSaving}
            />

            <label className="field">
              <span className="field__label">{t('pages.clients.statusLabel')}</span>
              <select
                className="field__input field__select"
                value={status}
                onChange={(e) => setStatus(e.target.value as ClientStatus)}
                disabled={isSaving}
                required
              >
                {CLIENT_STATUSES.map((item) => (
                  <option key={item} value={item}>
                    {statusLabel(item)}
                  </option>
                ))}
              </select>
            </label>

            <p className="surface__lead">{t('pages.clients.commercialHint')}</p>

            <div className="api-key-form__two-col-row">
              <InputField
                id="client-spread"
                label={t('pages.clients.spreadOverride')}
                value={spreadBpsOverride}
                onChange={(e) => setSpreadBpsOverride(e.target.value)}
                placeholder={t('pages.clients.spreadOverridePlaceholder')}
                disabled={isSaving}
              />
              <InputField
                id="client-limit"
                label={t('pages.clients.maxAmountBrl')}
                value={maxAmountBrl}
                onChange={(e) => setMaxAmountBrl(e.target.value)}
                placeholder={t('pages.clients.maxAmountBrlPlaceholder')}
                disabled={isSaving}
              />
            </div>

            {formMode === 'edit' ? (
              <>
                <h4 className="user-management-form__title">{t('pages.clients.compliance.sectionTitle')}</h4>
                <p className="surface__lead">{t('pages.clients.compliance.sectionHint')}</p>

                <div className="api-key-form__two-col-row">
                  <label className="field">
                    <span className="field__label">{t('pages.clients.compliance.kybStatus')}</span>
                    <select
                      className="field__input field__select"
                      value={kybStatus}
                      onChange={(e) => setKybStatus(e.target.value as KybStatus)}
                      disabled={isSaving}
                    >
                      {KYB_STATUSES.map((item) => (
                        <option key={item} value={item}>
                          {kybStatusLabel(item)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span className="field__label">{t('pages.clients.compliance.kycStatus')}</span>
                    <select
                      className="field__input field__select"
                      value={kycStatus}
                      onChange={(e) => setKycStatus(e.target.value as KycStatus)}
                      disabled={isSaving}
                    >
                      {KYC_STATUSES.map((item) => (
                        <option key={item} value={item}>
                          {kycStatusLabel(item)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <InputField
                  id="client-compliance-notes"
                  label={t('pages.clients.compliance.notes')}
                  value={complianceNotes}
                  onChange={(e) => setComplianceNotes(e.target.value)}
                  placeholder={t('pages.clients.compliance.notesPlaceholder')}
                  disabled={isSaving}
                />

                <InputField
                  id="client-compliance-rejection"
                  label={t('pages.clients.compliance.rejectionReason')}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder={t('pages.clients.compliance.rejectionReasonPlaceholder')}
                  disabled={isSaving}
                />
              </>
            ) : null}

            <div className="user-management-form__actions">
              <Button type="submit" disabled={isSaving}>
                {isSaving
                  ? t('pages.clients.saving')
                  : formMode === 'create'
                    ? t('pages.clients.create')
                    : t('pages.clients.save')}
              </Button>
              <Button type="button" variant="ghost" disabled={isSaving} onClick={resetForm}>
                {t('pages.clients.cancel')}
              </Button>
            </div>
          </form>
        ) : null}

        <div className="user-management-table-wrap">
          <table className="user-management-table">
            <thead>
              <tr>
                <th>{t('pages.clients.columns.name')}</th>
                <th>{t('pages.clients.columns.taxId')}</th>
                <th>{t('pages.clients.columns.status')}</th>
                <th>{t('pages.clients.columns.kyb')}</th>
                <th>{t('pages.clients.columns.contact')}</th>
                <th aria-label={t('pages.clients.columns.actions')} />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6}>{t('pages.clients.loading')}</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>{t('pages.clients.empty')}</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.trade_name?.trim() || row.legal_name}</strong>
                      {row.trade_name ? (
                        <span className="field__hint">
                          <br />
                          {row.legal_name}
                        </span>
                      ) : null}
                    </td>
                    <td>{formatClientTaxId(row.tax_id)}</td>
                    <td>
                      <span className={`whitelist-status whitelist-status--${row.status === 'active' ? 'approved' : row.status === 'draft' ? 'pending' : 'rejected'}`}>
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`whitelist-status whitelist-status--${
                          row.kyb_status === 'approved'
                            ? 'approved'
                            : row.kyb_status === 'pending'
                              ? 'pending'
                              : row.kyb_status === 'rejected'
                                ? 'rejected'
                                : 'pending'
                        }`}
                      >
                        {kybStatusLabel(row.kyb_status ?? 'not_started')}
                      </span>
                    </td>
                    <td>{row.contact_email ?? '—'}</td>
                    <td className="user-management-table__actions">
                      <button
                        type="button"
                        className="icon-button"
                        disabled={isSaving}
                        onClick={() => void openEdit(row)}
                        aria-label={t('pages.clients.edit')}
                        title={t('pages.clients.edit')}
                      >
                        <PencilIcon width={16} height={16} />
                      </button>
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
