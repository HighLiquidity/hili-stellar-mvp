import { GlobeIcon } from './Icons';
import { useI18n } from '@/lib/i18n';

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  const nextLocale = locale === 'pt' ? 'en' : 'pt';
  const indicator = locale.toUpperCase();
  const nextLocaleLabel = nextLocale === 'pt' ? t('controls.portuguese') : t('controls.english');

  return (
    <button
      type="button"
      className="language-toggle"
      onClick={() => setLocale(nextLocale)}
      aria-label={t('shell.language')}
      title={nextLocaleLabel}
    >
      <span className="language-toggle__icon" aria-hidden="true">
        <GlobeIcon width={18} height={18} />
      </span>
      <span className="language-toggle__label" aria-hidden="true">
        {indicator}
      </span>
    </button>
  );
}
