'use client';

import type { ReactNode } from 'react';

import { GlobeIcon, MonitorIcon, MoonIcon, SunIcon } from './Icons';
import { useI18n, type Locale } from '@/lib/i18n';
import { useTheme, type ThemePreference } from '@/lib/theme';

type SegmentOption<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
  title?: string;
};

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  ariaLabel,
}: {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="sidebar-appearance__group">
      <span className="sidebar-appearance__label">{label}</span>
      <div className="sidebar-appearance__segments" role="group" aria-label={ariaLabel}>
        {options.map((option) => {
          const isActive = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              className={`sidebar-appearance__segment${isActive ? ' is-active' : ''}`}
              aria-pressed={isActive}
              title={option.title ?? option.label}
              onClick={() => onChange(option.value)}
            >
              {option.icon ? (
                <span className="sidebar-appearance__segment-icon" aria-hidden="true">
                  {option.icon}
                </span>
              ) : null}
              <span className="sidebar-appearance__segment-label">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SidebarAppearanceControls({ collapsed = false }: { collapsed?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  const { preference, setPreference } = useTheme();

  const languageOptions: SegmentOption<Locale>[] = [
    { value: 'pt', label: t('controls.portuguese'), title: t('controls.portugueseFull') },
    { value: 'en', label: t('controls.english'), title: t('controls.englishFull') },
  ];

  const themeOptions: SegmentOption<ThemePreference>[] = [
    {
      value: 'light',
      label: t('controls.light'),
      title: t('controls.light'),
      icon: <SunIcon width={13} height={13} />,
    },
    {
      value: 'dark',
      label: t('controls.dark'),
      title: t('controls.dark'),
      icon: <MoonIcon width={13} height={13} />,
    },
    {
      value: 'system',
      label: t('controls.system'),
      title: t('controls.system'),
      icon: <MonitorIcon width={13} height={13} />,
    },
  ];

  return (
    <div className={`sidebar-appearance${collapsed ? ' is-collapsed' : ''}`}>
      {!collapsed ? (
        <div className="sidebar-appearance__heading">
          <GlobeIcon width={14} height={14} aria-hidden="true" />
          <span>{t('shell.appearance')}</span>
        </div>
      ) : null}

      <SegmentedControl
        label={t('shell.language')}
        ariaLabel={t('shell.language')}
        value={locale}
        options={languageOptions}
        onChange={setLocale}
      />

      <SegmentedControl
        label={t('shell.theme')}
        ariaLabel={t('shell.theme')}
        value={preference}
        options={themeOptions}
        onChange={setPreference}
      />
    </div>
  );
}
