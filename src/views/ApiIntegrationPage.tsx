'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { canManageApiKeys } from '@/lib/users/panel-access';
import { useI18n } from '@/lib/i18n';
import { ApiActivityPanel } from '@/views/api-integration/ApiActivityPanel';
import { ApiDocsPanel } from '@/views/api-integration/ApiDocsPanel';
import { ApiIntegrationOverviewPanel } from '@/views/api-integration/ApiIntegrationOverviewPanel';
import { ApiKeysAdminPanel } from '@/views/api-integration/ApiKeysAdminPanel';

type ApiIntegrationTab = 'overview' | 'keys' | 'docs' | 'activity';

export function ApiIntegrationPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { profile, isLoading: authLoading, isAuthorized } = useAuth();
  const isPlatformAdmin = profile?.role === 'admin';
  const canAccess = canManageApiKeys(profile?.role);
  const [activeTab, setActiveTab] = useState<ApiIntegrationTab>('keys');

  const visibleTabs = useMemo<ApiIntegrationTab[]>(() => {
    if (isPlatformAdmin) return ['overview', 'keys', 'docs', 'activity'];
    return ['keys', 'docs'];
  }, [isPlatformAdmin]);

  useEffect(() => {
    if (authLoading || !isAuthorized) return;
    if (!canAccess) {
      router.replace('/app/dashboard');
    }
  }, [authLoading, canAccess, isAuthorized, router]);

  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab(visibleTabs[0] ?? 'keys');
    }
  }, [activeTab, visibleTabs]);

  if (authLoading || !canAccess) {
    return (
      <section className="dashboard-layout">
        <article className="surface">
          <p className="surface__lead">{t('pages.apiIntegration.loading')}</p>
        </article>
      </section>
    );
  }

  return (
    <section className="dashboard-layout">
      <article className="surface user-management-card">
        <div className="user-management-card__header">
          <div>
            <p className="eyebrow">{t('pages.apiIntegration.eyebrow')}</p>
            <h2 className="user-management-card__title">{t('pages.apiIntegration.title')}</h2>
            <div className="onramp-inline-actions" role="tablist" aria-label={t('pages.apiIntegration.tabsLabel')}>
              {visibleTabs.includes('overview') ? (
                <Button
                  type="button"
                  role="tab"
                  variant={activeTab === 'overview' ? 'primary' : 'secondary'}
                  aria-selected={activeTab === 'overview'}
                  onClick={() => setActiveTab('overview')}
                >
                  {t('pages.apiIntegration.tabs.overview')}
                </Button>
              ) : null}
              <Button
                type="button"
                role="tab"
                variant={activeTab === 'keys' ? 'primary' : 'secondary'}
                aria-selected={activeTab === 'keys'}
                onClick={() => setActiveTab('keys')}
              >
                {t('pages.apiIntegration.tabs.keys')}
              </Button>
              <Button
                type="button"
                role="tab"
                variant={activeTab === 'docs' ? 'primary' : 'secondary'}
                aria-selected={activeTab === 'docs'}
                onClick={() => setActiveTab('docs')}
              >
                {t('pages.apiIntegration.tabs.docs')}
              </Button>
              {visibleTabs.includes('activity') ? (
                <Button
                  type="button"
                  role="tab"
                  variant={activeTab === 'activity' ? 'primary' : 'secondary'}
                  aria-selected={activeTab === 'activity'}
                  onClick={() => setActiveTab('activity')}
                >
                  {t('pages.apiIntegration.tabs.activity')}
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {activeTab === 'overview' ? <ApiIntegrationOverviewPanel /> : null}
        {activeTab === 'keys' ? <ApiKeysAdminPanel isPlatformAdmin={isPlatformAdmin} /> : null}
        {activeTab === 'docs' ? <ApiDocsPanel /> : null}
        {activeTab === 'activity' ? <ApiActivityPanel /> : null}
      </article>
    </section>
  );
}
