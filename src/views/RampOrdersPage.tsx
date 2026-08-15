'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { StatementPagination } from '@/components/statement/StatementPagination';
import { InputField } from '@/components/ui/InputField';
import { useAuth } from '@/hooks/useAuth';
import { useUsdcRampAccess } from '@/hooks/useRampAvailability';
import {
  defaultStatementDateFrom,
  defaultStatementDateTo,
  STATEMENT_PAGE_SIZE_OPTIONS,
  type StatementPageSize,
} from '@/lib/ledger/filters';
import { useI18n } from '@/lib/i18n';
import type { RampOrderFlow, RampOrderListItem, RampOrdersListResponse } from '@/lib/ramp/list-contracts';
import { rampOrderDetailHref } from '@/lib/ramp/order-links';

type FlowTab = RampOrderFlow;

const ONRAMP_STATUSES = [
  'quoted',
  'awaiting_pix',
  'pix_received',
  'brh_sold',
  'usdc_delivered',
  'fx_settled',
  'brh_redeemed',
  'complete',
  'expired',
  'failed',
  'refunded',
  'needs_review',
] as const;

const OFFRAMP_STATUSES = [
  'quoted',
  'awaiting_deposit',
  'usdc_received',
  'pix_sent',
  'brh_recorded',
  'fx_settled',
  'complete',
  'expired',
  'failed',
  'refunded',
  'needs_review',
] as const;

function formatDateTime(value: string, localeCode: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(localeCode, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatBrl(value: string, localeCode: string) {
  const n = Number(value.replace(',', '.'));
  return new Intl.NumberFormat(localeCode, {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

async function fetchOrders(
  accessToken: string,
  flow: FlowTab,
  query: URLSearchParams,
): Promise<RampOrdersListResponse> {
  const base = flow === 'onramp' ? '/api/onramp/orders' : '/api/offramp/orders';
  const response = await fetch(`${base}?${query.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = (await response.json()) as RampOrdersListResponse & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `HTTP ${response.status}`);
  }
  return payload;
}

function shortenId(id: string): string {
  const trimmed = id.trim();
  if (trimmed.length <= 14) return trimmed;
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
}

export function RampOrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, locale } = useI18n();
  const { session, isLoading: authLoading, isAuthorized } = useAuth();
  const { canAccess: canAccessRamp } = useUsdcRampAccess();
  const localeCode = locale === 'pt' ? 'pt-BR' : 'en-US';
  const accessToken = session?.access_token ?? null;

  const initialFlow = searchParams.get('flow') === 'offramp' ? 'offramp' : 'onramp';

  const [flow, setFlow] = useState<FlowTab>(initialFlow);
  const [dateFrom, setDateFrom] = useState(defaultStatementDateFrom());
  const [dateTo, setDateTo] = useState(defaultStatementDateTo());
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<StatementPageSize>(25);
  const [orders, setOrders] = useState<RampOrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !isAuthorized) return;
    if (!canAccessRamp) {
      router.replace('/app/dashboard');
    }
  }, [authLoading, canAccessRamp, isAuthorized, router]);

  const statusOptions = useMemo(() => {
    const values = flow === 'onramp' ? ONRAMP_STATUSES : OFFRAMP_STATUSES;
    return values.map((value) => ({ value, label: t(`pages.${flow}.status.${value}`) }));
  }, [flow, t]);

  const loadPage = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        dateFrom,
        dateTo,
      });
      if (status !== 'all') {
        query.set('status', status);
      }
      const result = await fetchOrders(accessToken, flow, query);
      setOrders(result.orders);
      setTotal(result.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setOrders([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, dateFrom, dateTo, flow, page, pageSize, status]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  function handleFlowChange(next: FlowTab) {
    setFlow(next);
    setStatus('all');
    setPage(1);
  }

  if (authLoading || !canAccessRamp) {
    return (
      <section className="dashboard-layout">
        <article className="surface">
          <p className="surface__lead">{t('pages.settings.loading')}</p>
        </article>
      </section>
    );
  }

  return (
    <section className="dashboard-layout">
      <article className="surface statement-toolbar">
        <div className="statement-toolbar__title-row">
          <div>
            <p className="eyebrow">{t('pages.rampOrders.eyebrow')}</p>
            <h2>{t('pages.rampOrders.title')}</h2>
            <p className="surface__lead">{t('pages.rampOrders.description')}</p>
          </div>
        </div>

        <div className="ramp-orders-tabs" role="tablist" aria-label={t('pages.rampOrders.tabsLabel')}>
          <button
            type="button"
            role="tab"
            aria-selected={flow === 'onramp'}
            className={`ramp-orders-tabs__tab${flow === 'onramp' ? ' is-active' : ''}`}
            onClick={() => handleFlowChange('onramp')}
          >
            {t('pages.rampOrders.tabOnramp')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={flow === 'offramp'}
            className={`ramp-orders-tabs__tab${flow === 'offramp' ? ' is-active' : ''}`}
            onClick={() => handleFlowChange('offramp')}
          >
            {t('pages.rampOrders.tabOfframp')}
          </button>
        </div>

        <div className="statement-toolbar__filters">
          <InputField
            id="ramp-orders-date-from"
            label={t('pages.statement.filterDateFrom')}
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
          />
          <InputField
            id="ramp-orders-date-to"
            label={t('pages.statement.filterDateTo')}
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
          />
          <label className="field">
            <span className="field__label">{t('pages.rampOrders.filterStatus')}</span>
            <select
              className="field__input field__select"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">{t('pages.rampOrders.filterStatusAll')}</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">{t('pages.statement.pageSize')}</span>
            <select
              className="field__input field__select"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value) as StatementPageSize);
                setPage(1);
              }}
            >
              {STATEMENT_PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {t('pages.statement.pageSizeOption').replace('{{count}}', String(n))}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="statement-toolbar__summary">
          {t('pages.rampOrders.resultsSummary')
            .replace('{{count}}', String(total))
            .replace('{{from}}', dateFrom)
            .replace('{{to}}', dateTo)}
        </p>
      </article>

      <article className="surface ramp-orders-card">
        {error ? (
          <p className="auth-inline-error" role="alert">
            {t('pages.rampOrders.loadError')}: {error}
          </p>
        ) : null}

        {isLoading ? (
          <p className="surface__lead">{t('pages.rampOrders.loading')}</p>
        ) : orders.length === 0 ? (
          <p className="surface__lead">{t('pages.rampOrders.empty')}</p>
        ) : (
          <div className="ramp-orders-table-wrap">
            <table className="ramp-orders-table">
              <thead>
                <tr>
                  <th>{t('pages.rampOrders.colCreated')}</th>
                  <th>{t('pages.rampOrders.colStatus')}</th>
                  <th>{t('pages.rampOrders.colBrl')}</th>
                  <th>{t('pages.rampOrders.colUsdc')}</th>
                  <th>{t('pages.rampOrders.colCounterpart')}</th>
                  <th>{t('pages.rampOrders.colOrder')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {orders.map((row) => (
                  <tr key={row.orderId}>
                    <td>{formatDateTime(row.createdAt, localeCode)}</td>
                    <td>
                      <span className="ramp-orders-table__status">
                        {t(`pages.${row.flow}.status.${row.status}`)}
                      </span>
                    </td>
                    <td>{formatBrl(row.amountBrl, localeCode)}</td>
                    <td>{row.amountUsdc}</td>
                    <td className="ramp-orders-table__counterpart">
                      {row.counterpartLabel ? shortenId(row.counterpartLabel) : '—'}
                    </td>
                    <td>
                      <code className="ramp-orders-table__id">{shortenId(row.orderId)}</code>
                    </td>
                    <td className="ramp-orders-table__actions">
                      <Link href={rampOrderDetailHref(row.flow, row.orderId)} className="auth-text-link">
                        {t('pages.rampOrders.viewOrder')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <StatementPagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          onPageChange={setPage}
          disabled={isLoading}
        />
      </article>
    </section>
  );
}
