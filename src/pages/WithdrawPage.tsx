import { useI18n } from '../lib/i18n';

export function WithdrawPage() {
  const { t } = useI18n();

  return (
    <section className="page-grid">
      <article className="surface surface--hero">
        <p className="eyebrow">{t('pages.withdraw.eyebrow')}</p>
        <h2>{t('pages.withdraw.title')}</h2>
        <p className="surface__lead">{t('pages.withdraw.description')}</p>

        <div className="placeholder-panel">
          <div>
            <strong>{t('pages.withdraw.cardTitle')}</strong>
            <p>{t('pages.withdraw.cardBody')}</p>
          </div>
          <span className="placeholder-badge">{t('pages.withdraw.badge')}</span>
        </div>
      </article>

      <article className="surface">
        <h3>{t('pages.withdraw.checklistTitle')}</h3>
        <ul className="checklist">
          <li>{t('pages.withdraw.checklistOne')}</li>
          <li>{t('pages.withdraw.checklistTwo')}</li>
          <li>{t('pages.withdraw.checklistThree')}</li>
        </ul>
      </article>
    </section>
  );
}
