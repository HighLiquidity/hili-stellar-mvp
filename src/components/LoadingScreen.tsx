'use client';

import { useI18n } from '@/lib/i18n';

export function LoadingScreen() {
  const { t } = useI18n();

  return (
    <div className="loading-screen">
      <div className="loading-screen__card">
        <div className="loading-screen__spinner" aria-hidden="true" />
        <p>{t('app.loading')}</p>
      </div>
    </div>
  );
}
