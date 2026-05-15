import { MoonIcon, SunIcon } from './Icons';
import { useTheme } from '../lib/theme';
import { useI18n } from '../lib/i18n';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useI18n();
  const isLight = theme === 'light';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={t('shell.theme')}
      title={isLight ? t('controls.dark') : t('controls.light')}
    >
      <span className="theme-toggle__icon" aria-hidden="true">
        {isLight ? <MoonIcon width={16} height={16} /> : <SunIcon width={16} height={16} />}
      </span>
      <span>{isLight ? t('controls.dark') : t('controls.light')}</span>
    </button>
  );
}
