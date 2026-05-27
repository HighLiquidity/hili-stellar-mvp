'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '../components/ui/Button';
import { useAuth } from '../hooks/useAuth';
import {
  FIAT_OPERATION_EVENTS_TABLE,
  type FiatOperationEventRow,
} from '../lib/fiat-operations/event-row';
import { useI18n } from '@/lib/i18n';
import { supabase } from '../integrations/supabase/client';

const PAGE_SIZE = 80;

type OperationFilter = 'all' | 'fiat_deposit' | 'fiat_withdraw' | 'fiat_onramp';
type StatusFilter = 'all' | 'success' | 'error';

function formatEventTimestamp(iso: string, localeCode: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(localeCode, {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
}

function metadataPreview(metadata: Record<string, unknown> | null): string {
  if (!metadata || Object.keys(metadata).length === 0) return '—';
  try {
    const text = JSON.stringify(metadata, null, 2);
    return text.length > 600 ? `${text.slice(0, 597)}…` : text;
  } catch {
    return '—';
  }
}

function cell(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : '—';
}

export function OperationEventsPage() {
  const { t, locale } = useI18n();
  const localeCode = locale === 'pt' ? 'pt-BR' : 'en-US';
  const router = useRouter();
  const { profile, isLoading: authLoading, isAuthorized } = useAuth();

  const [rows, setRows] = useState<FiatOperationEventRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [operationFilter, setOperationFilter] = useState<OperationFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (authLoading || !isAuthorized) return;
    if (profile?.role !== 'admin') {
      router.replace('/app/dashboard');
    }
  }, [authLoading, isAuthorized, profile?.role, router]);

  const loadEvents = useCallback(async () => {
    setLoadError(null);
    setIsRefreshing(true);

    try {
      let query = supabase
        .from(FIAT_OPERATION_EVENTS_TABLE)
        .select(
          'id, created_at, operation, phase, status, error_code, error_message, actor_email, actor_user_id, tax_id, amount_brl, provider_tx_id, e2e_id, correlation_id, idempotency_key, beneficiary_name, stage, brh_balance_before, metadata',
        )
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (operationFilter !== 'all') {
        query = query.eq('operation', operationFilter);
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;

      if (error) {
        setLoadError(error.message);
        setRows([]);
        return;
      }

      setRows((data ?? []) as FiatOperationEventRow[]);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [operationFilter, statusFilter]);

  useEffect(() => {
    if (authLoading || profile?.role !== 'admin') return;
    setIsLoading(true);
    void loadEvents();
  }, [authLoading, profile?.role, loadEvents]);

  const operationLabel = useMemo(
    () => ({
      fiat_deposit: t('pages.eventLogs.operation.deposit'),
      fiat_withdraw: t('pages.eventLogs.operation.withdraw'),
      fiat_onramp: t('pages.eventLogs.operation.onramp'),
    }),
    [t],
  );

  const statusLabel = useMemo(
    () => ({
      success: t('pages.eventLogs.status.success'),
      error: t('pages.eventLogs.status.error'),
    }),
    [t],
  );

  if (authLoading || profile?.role !== 'admin') {
    return (
      <section className="dashboard-layout">
        <article className="surface">
          <p className="surface__lead">{t('pages.eventLogs.loading')}</p>
        </article>
      </section>
    );
  }

  return (
    <section className="dashboard-layout">
      <article className="surface">
        <div className="operation-events-card__header">
          <div>
            <p className="eyebrow">{t('pages.eventLogs.eyebrow')}</p>
          </div>
        </div>

        <div className="operation-events-toolbar">
          <label className="operation-events-filter">
            <span>{t('pages.eventLogs.filter.operation')}</span>
            <select
              value={operationFilter}
              onChange={(e) => setOperationFilter(e.target.value as OperationFilter)}
            >
              <option value="all">{t('pages.eventLogs.filter.all')}</option>
              <option value="fiat_deposit">{operationLabel.fiat_deposit}</option>
              <option value="fiat_withdraw">{operationLabel.fiat_withdraw}</option>
              <option value="fiat_onramp">{operationLabel.fiat_onramp}</option>
            </select>
          </label>

          <label className="operation-events-filter">
            <span>{t('pages.eventLogs.filter.status')}</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">{t('pages.eventLogs.filter.all')}</option>
              <option value="success">{statusLabel.success}</option>
              <option value="error">{statusLabel.error}</option>
            </select>
          </label>

          <Button
            type="button"
            variant="secondary"
            disabled={isRefreshing}
            onClick={() => void loadEvents()}
          >
            {isRefreshing ? t('pages.eventLogs.refreshing') : t('pages.eventLogs.refresh')}
          </Button>
        </div>

        {loadError ? (
          <p className="auth-inline-error" role="alert">
            {loadError}
          </p>
        ) : null}

        {isLoading ? (
          <p className="surface__lead">{t('pages.eventLogs.loading')}</p>
        ) : rows.length === 0 ? (
          <p className="surface__lead">{t('pages.eventLogs.empty')}</p>
        ) : (
          <div className="operation-events-table-wrap">
            <table className="operation-events-table">
              <thead>
                <tr>
                  <th scope="col">{t('pages.eventLogs.columns.time')}</th>
                  <th scope="col">{t('pages.eventLogs.columns.operation')}</th>
                  <th scope="col">{t('pages.eventLogs.columns.status')}</th>
                  <th scope="col">{t('pages.eventLogs.columns.amount')}</th>
                  <th scope="col">{t('pages.eventLogs.columns.taxId')}</th>
                  <th scope="col">{t('pages.eventLogs.columns.actor')}</th>
                  <th scope="col">{t('pages.eventLogs.columns.summary')}</th>
                  <th scope="col">{t('pages.eventLogs.columns.details')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isExpanded = expandedId === row.id;
                  const summary =
                    row.status === 'error'
                      ? cell(row.error_message) || cell(row.error_code)
                      : cell(row.provider_tx_id) || cell(row.stage);

                  return (
                    <Fragment key={row.id}>
                      <tr>
                        <td>{formatEventTimestamp(row.created_at, localeCode)}</td>
                        <td>{operationLabel[row.operation]}</td>
                        <td>
                          <span className={`event-status-badge event-status-badge--${row.status}`}>
                            {statusLabel[row.status]}
                          </span>
                        </td>
                        <td>{cell(row.amount_brl)}</td>
                        <td>{cell(row.tax_id)}</td>
                        <td>{cell(row.actor_email)}</td>
                        <td className="operation-events-table__summary">{summary}</td>
                        <td>
                          <button
                            type="button"
                            className="operation-events-detail-toggle"
                            onClick={() =>
                              setExpandedId((current) => (current === row.id ? null : row.id))
                            }
                          >
                            {isExpanded
                              ? t('pages.eventLogs.hideDetails')
                              : t('pages.eventLogs.showDetails')}
                          </button>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="operation-events-detail-row">
                          <td colSpan={8}>
                            <DetailGrid>
                              <DetailItem label={t('pages.eventLogs.detail.phase')} value={row.phase} />
                              <DetailItem
                                label={t('pages.eventLogs.detail.beneficiary')}
                                value={row.beneficiary_name}
                              />
                              <DetailItem label={t('pages.eventLogs.detail.stage')} value={row.stage} />
                              <DetailItem
                                label={t('pages.eventLogs.detail.brhBalance')}
                                value={row.brh_balance_before}
                              />
                              <DetailItem
                                label={t('pages.eventLogs.detail.errorCode')}
                                value={row.error_code}
                              />
                              <DetailItem
                                label={t('pages.eventLogs.detail.errorMessage')}
                                value={row.error_message}
                              />
                              <DetailItem
                                label={t('pages.eventLogs.detail.providerTx')}
                                value={row.provider_tx_id}
                              />
                              <DetailItem label={t('pages.eventLogs.detail.e2e')} value={row.e2e_id} />
                              <DetailItem
                                label={t('pages.eventLogs.detail.idempotency')}
                                value={row.idempotency_key}
                              />
                              <DetailItem
                                label={t('pages.eventLogs.detail.actorUserId')}
                                value={row.actor_user_id}
                              />
                              <DetailItem
                                label={t('pages.eventLogs.detail.metadata')}
                                value={metadataPreview(row.metadata)}
                                wide
                              />
                            </DetailGrid>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && rows.length > 0 ? (
          <p className="operation-events-footnote">
            {t('pages.eventLogs.showingCount').replace('{{count}}', String(rows.length))}
          </p>
        ) : null}
      </article>
    </section>
  );
}

function DetailGrid({ children }: { children: React.ReactNode }) {
  return <div className="operation-events-detail-grid">{children}</div>;
}

function DetailItem({
  label,
  value,
  wide,
}: {
  label: string;
  value: string | null;
  wide?: boolean;
}) {
  const display = cell(value);
  return (
    <div className={wide ? 'operation-events-detail-field is-wide' : 'operation-events-detail-field'}>
      <span className="operation-events-detail-field__label">{label}</span>
      {wide && display !== '—' ? (
        <pre className="operation-events-metadata">{display}</pre>
      ) : (
        <span className="operation-events-detail-field__value">{display}</span>
      )}
    </div>
  );
}