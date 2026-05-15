import { useI18n } from '../lib/i18n';

export function DepositPage() {
  const { t } = useI18n();

  return (
    <section className="page-grid">
      <article className="surface surface--hero">
        <p className="eyebrow">{t('pages.deposit.eyebrow')}</p>
        <h2>{t('pages.deposit.title')}</h2>
        <p className="surface__lead">{t('pages.deposit.description')}</p>

        <div className="placeholder-panel">
          <div>
            <strong>{t('pages.deposit.cardTitle')}</strong>
            <p>{t('pages.deposit.cardBody')}</p>
          </div>
          <span className="placeholder-badge">{t('pages.deposit.badge')}</span>
        </div>
      </article>

      <article className="surface">
        <h3>{t('pages.deposit.checklistTitle')}</h3>
        <ul className="checklist">
          <li>{t('pages.deposit.checklistOne')}</li>
          <li>{t('pages.deposit.checklistTwo')}</li>
          <li>{t('pages.deposit.checklistThree')}</li>
        </ul>
      </article>
    </section>
  );
}
