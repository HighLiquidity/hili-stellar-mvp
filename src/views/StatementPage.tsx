'use client';

import { useI18n } from '@/lib/i18n';

export function StatementPage() {
  const { t } = useI18n();

  return (
    <section className="page-grid page-grid--single">
      <article className="surface surface--hero">
        <p className="eyebrow">{t('pages.statement.eyebrow')}</p>
        <h2>{t('pages.statement.title')}</h2>
        <p className="surface__lead">{t('pages.statement.description')}</p>
      </article>

      <article className="surface surface--empty">
        <span className="empty-state__badge">{t('pages.statement.cardTitle')}</span>
        <h3>{t('pages.statement.cardTitle')}</h3>
        <p>{t('pages.statement.cardBody')}</p>
      </article>
    </section>
  );
}
