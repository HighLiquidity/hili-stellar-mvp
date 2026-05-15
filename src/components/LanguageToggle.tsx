import { GlobeIcon } from './Icons';
import { useI18n } from '../lib/i18n';

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="segmented-control" role="group" aria-label={t('shell.language')}>
      <span className="segmented-control__icon" aria-hidden="true">
        <GlobeIcon width={16} height={16} />
      </span>
      <button
        type="button"
        className={`segmented-control__button${locale === 'pt' ? ' is-active' : ''}`}
        onClick={() => setLocale('pt')}
      >
        {t('controls.portuguese')}
      </button>
      <button
        type="button"
        className={`segmented-control__button${locale === 'en' ? ' is-active' : ''}`}
        onClick={() => setLocale('en')}
      >
        {t('controls.english')}
      </button>
    </div>
  );
}
