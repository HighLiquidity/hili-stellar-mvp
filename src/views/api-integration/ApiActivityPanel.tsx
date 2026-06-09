'use client';

import { useCallback, useEffect, useState } from 'react';

import { listApiKeyActivityAction } from '@/app/actions/api-keys';
import { DevNotice } from '@/components/DevNotice';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { ApiActivityRow } from '@/lib/api-keys/types';
import { useI18n } from '@/lib/i18n';

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function formatDateTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));
}

export function ApiActivityPanel() {
  const { t, locale } = useI18n();
  const { profile } = useAuth();

  const [rows, setRows] = useState<ApiActivityRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadActivity = useCallback(async () => {
    setLoadError(null);

    try {
      const token = await getAccessToken();
      if (!token) {
        setLoadError(t('pages.apiIntegration.keys.errors.session'));
        setRows([]);
        return;
      }

      const result = await listApiKeyActivityAction(token);
      if (!result.ok) {
        if (result.message === 'TABLE_MISSING:api_key_request_logs') {
          setLoadError(t('pages.apiIntegration.activity.errors.tableMissing'));
        } else {
          setLoadError(result.message);
        }
        setRows([]);
        return;
      }

      setRows(result.data);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    if (profile?.role !== 'admin') return;
    void loadActivity();
  }, [loadActivity, profile?.role]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    void loadActivity();
  };

  return (
    <div className="api-integration-panel">
      <DevNotice title={t('pages.apiIntegration.activity.devNoticePersisted.title')} variant="info">
        <p>{t('pages.apiIntegration.activity.devNoticePersisted.body')}</p>
      </DevNotice>

      <div className="api-integration-panel__toolbar">
        <Button type="button" variant="secondary" onClick={handleRefresh} disabled={isRefreshing}>
          {isRefreshing ? t('pages.apiIntegration.activity.refreshing') : t('pages.apiIntegration.activity.refresh')}
        </Button>
      </div>

      <p className="surface__lead">{t('pages.apiIntegration.activity.description')}</p>

      {loadError ? (
        <p className="auth-inline-error" role="alert">
          {loadError}
        </p>
      ) : null}

      {isLoading ? (
        <p className="surface__lead">{t('pages.apiIntegration.activity.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="surface__lead">{t('pages.apiIntegration.activity.empty')}</p>
      ) : (
        <div className="user-management-table-wrap">
          <table className="user-management-table">
            <thead>
              <tr>
                <th scope="col">{t('pages.apiIntegration.activity.columns.time')}</th>
                <th scope="col">{t('pages.apiIntegration.activity.columns.key')}</th>
                <th scope="col">{t('pages.apiIntegration.activity.columns.method')}</th>
                <th scope="col">{t('pages.apiIntegration.activity.columns.route')}</th>
                <th scope="col">{t('pages.apiIntegration.activity.columns.status')}</th>
                <th scope="col">{t('pages.apiIntegration.activity.columns.duration')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.occurredAt, locale)}</td>
                  <td>
                    <code>{row.keyPrefix}</code>
                  </td>
                  <td>
                    <code>{row.method}</code>
                  </td>
                  <td>
                    <code>{row.route}</code>
                  </td>
                  <td>
                    <span
                      className={`api-status-badge ${
                        row.statusCode >= 400 ? 'api-status-badge--comingSoon' : 'api-status-badge--available'
                      }`}
                    >
                      {row.statusCode}
                    </span>
                  </td>
                  <td>{row.durationMs != null ? `${row.durationMs} ms` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
