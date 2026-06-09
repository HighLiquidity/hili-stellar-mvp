'use client';

import Link from 'next/link';

import { DevNotice } from '@/components/DevNotice';
import type { ApiEndpointStatus, RoadmapItemStatus } from '@/lib/api-keys/types';
import { useI18n } from '@/lib/i18n';

const ONRAMP_STEPS = ['quote', 'lock', 'poll'] as const;
const OFFRAMP_STEPS = ['quote', 'lock', 'poll'] as const;

const ENDPOINTS: Array<{
  id: string;
  method: string;
  route: string;
  status: ApiEndpointStatus;
}> = [
  { id: 'onramp-quote', method: 'POST', route: '/api/v1/onramp/orders/quote', status: 'available' },
  { id: 'onramp-lock', method: 'POST', route: '/api/v1/onramp/orders/:id/lock', status: 'available' },
  { id: 'onramp-list', method: 'GET', route: '/api/v1/onramp/orders', status: 'available' },
  { id: 'onramp-get', method: 'GET', route: '/api/v1/onramp/orders/:id', status: 'available' },
  { id: 'offramp-quote', method: 'POST', route: '/api/v1/offramp/orders/quote', status: 'available' },
  { id: 'offramp-lock', method: 'POST', route: '/api/v1/offramp/orders/:id/lock', status: 'available' },
  { id: 'offramp-list', method: 'GET', route: '/api/v1/offramp/orders', status: 'available' },
  { id: 'offramp-get', method: 'GET', route: '/api/v1/offramp/orders/:id', status: 'available' },
  { id: 'reconcile', method: 'POST', route: '/api/*/orders/:id/reconcile', status: 'internal' },
  { id: 'webhooks-out', method: 'POST', route: 'Integrador (outbound)', status: 'planned' },
];

const ROADMAP: Array<{ id: string; status: RoadmapItemStatus }> = [
  { id: 'ui', status: 'done' },
  { id: 'apiKeys', status: 'done' },
  { id: 'v1', status: 'done' },
  { id: 'observability', status: 'done' },
  { id: 'contract', status: 'done' },
  { id: 'multiTenant', status: 'planned' },
  { id: 'webhooks', status: 'planned' },
];

function statusClassName(status: ApiEndpointStatus | RoadmapItemStatus): string {
  return `api-status-badge api-status-badge--${status}`;
}

export function ApiIntegrationOverviewPanel() {
  const { t } = useI18n();

  return (
    <div className="api-integration-panel">
      <DevNotice
        title={t('pages.apiIntegration.devNotice.title')}
        badge={t('pages.apiIntegration.devNotice.badge')}
        variant="warning"
      >
        <p>{t('pages.apiIntegration.devNotice.body')}</p>
      </DevNotice>

      <p className="surface__lead">{t('pages.apiIntegration.overview.description')}</p>

      <section className="api-flow-section">
        <h2 className="api-flow-section__title">{t('pages.apiIntegration.overview.onrampTitle')}</h2>
        <ol className="api-flow-steps">
          {ONRAMP_STEPS.map((step, index) => (
            <li key={step} className="api-flow-steps__item">
              <span className="api-flow-steps__index">{index + 1}</span>
              <div>
                <strong>{t(`pages.apiIntegration.overview.steps.${step}.title`)}</strong>
                <p>{t(`pages.apiIntegration.overview.steps.${step}.onramp`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="api-flow-section">
        <h2 className="api-flow-section__title">{t('pages.apiIntegration.overview.offrampTitle')}</h2>
        <ol className="api-flow-steps">
          {OFFRAMP_STEPS.map((step, index) => (
            <li key={`off-${step}`} className="api-flow-steps__item">
              <span className="api-flow-steps__index">{index + 1}</span>
              <div>
                <strong>{t(`pages.apiIntegration.overview.steps.${step}.title`)}</strong>
                <p>{t(`pages.apiIntegration.overview.steps.${step}.offramp`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="api-flow-section">
        <h2 className="api-flow-section__title">{t('pages.apiIntegration.overview.prerequisitesTitle')}</h2>
        <ul className="api-prerequisites-list">
          <li>{t('pages.apiIntegration.overview.prerequisites.operator')}</li>
          <li>
            {t('pages.apiIntegration.overview.prerequisites.wallets')}{' '}
            <Link href="/app/withdraw-whitelist">{t('pages.apiIntegration.overview.prerequisites.walletsLink')}</Link>
          </li>
          <li>
            {t('pages.apiIntegration.overview.prerequisites.pix')}{' '}
            <Link href="/app/withdraw-whitelist">{t('pages.apiIntegration.overview.prerequisites.pixLink')}</Link>
          </li>
          <li>
            {t('pages.apiIntegration.overview.prerequisites.users')}{' '}
            <Link href="/app/users">{t('pages.apiIntegration.overview.prerequisites.usersLink')}</Link>
          </li>
        </ul>
      </section>

      <section className="api-flow-section">
        <h2 className="api-flow-section__title">{t('pages.apiIntegration.overview.endpointsTitle')}</h2>
        <div className="user-management-table-wrap">
          <table className="user-management-table">
            <thead>
              <tr>
                <th scope="col">{t('pages.apiIntegration.overview.columns.method')}</th>
                <th scope="col">{t('pages.apiIntegration.overview.columns.route')}</th>
                <th scope="col">{t('pages.apiIntegration.overview.columns.status')}</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map((endpoint) => (
                <tr key={endpoint.id}>
                  <td>
                    <code>{endpoint.method}</code>
                  </td>
                  <td>
                    <code>{endpoint.route}</code>
                  </td>
                  <td>
                    <span className={statusClassName(endpoint.status)}>
                      {t(`pages.apiIntegration.status.${endpoint.status}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="api-flow-section">
        <h2 className="api-flow-section__title">{t('pages.apiIntegration.overview.roadmapTitle')}</h2>
        <ul className="api-roadmap-list">
          {ROADMAP.map((item) => (
            <li key={item.id} className="api-roadmap-list__item">
              <span className={statusClassName(item.status)}>
                {t(`pages.apiIntegration.roadmapStatus.${item.status}`)}
              </span>
              <span>{t(`pages.apiIntegration.overview.roadmap.${item.id}`)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
