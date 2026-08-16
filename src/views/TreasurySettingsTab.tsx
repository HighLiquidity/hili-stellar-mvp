'use client';

import { useState } from 'react';

import { DevNotice } from '@/components/DevNotice';
import { RampEnableToggle } from '@/components/RampEnableToggle';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import { useI18n } from '@/lib/i18n';
import {
  createDefaultTreasuryPolicyDraft,
  effectiveHigh,
  effectiveLow,
  type TreasuryPolicyDraft,
  type TreasuryRailBands,
  type TreasuryRailId,
  type TreasuryRefillMode,
} from '@/lib/treasury/policy-draft';

function formatBand(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—';
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

type RailCopy = {
  title: string;
  hint: string;
  unit: string;
  hasHigh: boolean;
};

export function TreasurySettingsTab() {
  const { t } = useI18n();
  const [draft, setDraft] = useState<TreasuryPolicyDraft>(createDefaultTreasuryPolicyDraft);

  const patch = (partial: Partial<TreasuryPolicyDraft>) => {
    setDraft((prev) => ({ ...prev, ...partial }));
  };

  const patchRail = (id: TreasuryRailId, partial: Partial<TreasuryRailBands>) => {
    setDraft((prev) => ({
      ...prev,
      rails: {
        ...prev.rails,
        [id]: { ...prev.rails[id], ...partial },
      },
    }));
  };

  const rails: Array<{ id: TreasuryRailId } & RailCopy> = [
    {
      id: 'usdc',
      title: t('pages.treasury.settings.railUsdcTitle'),
      hint: t('pages.treasury.settings.railUsdcHint'),
      unit: 'USDC',
      hasHigh: true,
    },
    {
      id: 'xlm',
      title: t('pages.treasury.settings.railXlmTitle'),
      hint: t('pages.treasury.settings.railXlmHint'),
      unit: 'XLM',
      hasHigh: false,
    },
    {
      id: 'brl',
      title: t('pages.treasury.settings.railBrlTitle'),
      hint: t('pages.treasury.settings.railBrlHint'),
      unit: 'BRL',
      hasHigh: true,
    },
  ];

  return (
    <div className="treasury-settings">
      <DevNotice
        variant="warning"
        badge={t('pages.treasury.settings.placeholderBadge')}
        title={t('pages.treasury.settings.placeholderTitle')}
      >
        <p>{t('pages.treasury.settings.placeholderBody')}</p>
      </DevNotice>

      <article className="surface admin-settings-card">
        <div className="admin-settings-card__header">
          <h2 className="admin-settings-card__title">{t('pages.treasury.settings.masterTitle')}</h2>
          <RampEnableToggle
            enabled={draft.autoEnabled}
            onLabel={t('pages.treasury.settings.on')}
            offLabel={t('pages.treasury.settings.off')}
            ariaLabel={
              draft.autoEnabled
                ? t('pages.treasury.settings.masterAriaDisable')
                : t('pages.treasury.settings.masterAriaEnable')
            }
            onRequestToggle={() => patch({ autoEnabled: !draft.autoEnabled })}
          />
        </div>
        <p className="surface__lead">{t('pages.treasury.settings.masterHint')}</p>
        <div className="treasury-settings-grid">
          <label className="field">
            <span className="field__label">{t('pages.treasury.settings.intervalLabel')}</span>
            <select
              className="field__input field__select"
              value={draft.checkIntervalMinutes}
              onChange={(e) => patch({ checkIntervalMinutes: e.target.value })}
            >
              {['5', '15', '30', '60'].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes === '60'
                    ? t('pages.treasury.settings.intervalHour')
                    : t('pages.treasury.settings.intervalOption').replace('{{n}}', minutes)}
                </option>
              ))}
            </select>
            <p className="field__hint">{t('pages.treasury.settings.intervalHint')}</p>
          </label>
          <label className="user-management-checkbox treasury-settings-checkbox">
            <input
              type="checkbox"
              checked={draft.shadowMode}
              onChange={(e) => patch({ shadowMode: e.target.checked })}
            />
            <span>
              <strong>{t('pages.treasury.settings.shadowLabel')}</strong>
              <span className="field__hint">{t('pages.treasury.settings.shadowHint')}</span>
            </span>
          </label>
        </div>
      </article>

      <article className="surface admin-settings-card">
        <h2 className="admin-settings-card__title">{t('pages.treasury.settings.refillTitle')}</h2>
        <p className="surface__lead">{t('pages.treasury.settings.refillHint')}</p>
        <div
          className="treasury-refill-asset"
          role="radiogroup"
          aria-label={t('pages.treasury.settings.refillTitle')}
        >
          {(['per_order', 'batch'] as TreasuryRefillMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={draft.usdcRefillMode === mode}
              className={`treasury-refill-asset__option${draft.usdcRefillMode === mode ? ' is-active' : ''}`}
              onClick={() => patch({ usdcRefillMode: mode })}
            >
              {mode === 'per_order'
                ? t('pages.treasury.settings.refillPerOrder')
                : t('pages.treasury.settings.refillBatch')}
            </button>
          ))}
        </div>
        <p className="field__hint">
          {draft.usdcRefillMode === 'per_order'
            ? t('pages.treasury.settings.refillPerOrderHint')
            : t('pages.treasury.settings.refillBatchHint')}
        </p>
        {draft.usdcRefillMode === 'batch' ? (
          <InputField
            id="treasury-policy-batch"
            label={t('pages.treasury.settings.batchLabel')}
            type="text"
            inputMode="decimal"
            value={draft.usdcBatchThreshold}
            onChange={(e) => patch({ usdcBatchThreshold: e.target.value })}
            placeholder="100"
          />
        ) : null}
      </article>

      {rails.map((rail) => {
        const bands = draft.rails[rail.id];
        const low = effectiveLow(bands.minAbs, bands.target, bands.minPct);
        const high = rail.hasHigh ? effectiveHigh(bands.maxAbs, bands.target, bands.maxPct) : null;
        return (
          <article key={rail.id} className="surface admin-settings-card">
            <div className="admin-settings-card__header">
              <h2 className="admin-settings-card__title">{rail.title}</h2>
              <label className="user-management-checkbox">
                <input
                  type="checkbox"
                  checked={bands.autoEnabled}
                  onChange={(e) => patchRail(rail.id, { autoEnabled: e.target.checked })}
                />
                {t('pages.treasury.settings.autoRail')}
              </label>
            </div>
            <p className="surface__lead">{rail.hint}</p>
            {rail.id === 'brl' ? (
              <DevNotice
                variant="info"
                title={t('pages.treasury.settings.railBrlWarningTitle')}
              >
                <p>{t('pages.treasury.settings.railBrlWarningBody')}</p>
              </DevNotice>
            ) : null}
            <div className="treasury-settings-grid treasury-settings-grid--bands">
              <InputField
                id={`treasury-policy-${rail.id}-target`}
                label={`${t('pages.treasury.settings.target')} (${rail.unit})`}
                type="text"
                inputMode="decimal"
                value={bands.target}
                onChange={(e) => patchRail(rail.id, { target: e.target.value })}
              />
              <InputField
                id={`treasury-policy-${rail.id}-min-abs`}
                label={`${t('pages.treasury.settings.minAbs')} (${rail.unit})`}
                type="text"
                inputMode="decimal"
                value={bands.minAbs}
                onChange={(e) => patchRail(rail.id, { minAbs: e.target.value })}
              />
              <InputField
                id={`treasury-policy-${rail.id}-min-pct`}
                label={t('pages.treasury.settings.minPct')}
                type="text"
                inputMode="decimal"
                value={bands.minPct}
                onChange={(e) => patchRail(rail.id, { minPct: e.target.value })}
              />
              {rail.hasHigh ? (
                <>
                  <InputField
                    id={`treasury-policy-${rail.id}-max-abs`}
                    label={`${t('pages.treasury.settings.maxAbs')} (${rail.unit})`}
                    type="text"
                    inputMode="decimal"
                    value={bands.maxAbs}
                    onChange={(e) => patchRail(rail.id, { maxAbs: e.target.value })}
                  />
                  <InputField
                    id={`treasury-policy-${rail.id}-max-pct`}
                    label={t('pages.treasury.settings.maxPct')}
                    type="text"
                    inputMode="decimal"
                    value={bands.maxPct}
                    onChange={(e) => patchRail(rail.id, { maxPct: e.target.value })}
                  />
                </>
              ) : null}
              <InputField
                id={`treasury-policy-${rail.id}-cooldown`}
                label={t('pages.treasury.settings.cooldown')}
                type="text"
                inputMode="numeric"
                value={bands.cooldownMinutes}
                onChange={(e) => patchRail(rail.id, { cooldownMinutes: e.target.value })}
              />
              <InputField
                id={`treasury-policy-${rail.id}-max-run`}
                label={`${t('pages.treasury.settings.maxPerRun')} (${rail.unit})`}
                type="text"
                inputMode="decimal"
                value={bands.maxPerRun}
                onChange={(e) => patchRail(rail.id, { maxPerRun: e.target.value })}
              />
              <InputField
                id={`treasury-policy-${rail.id}-daily`}
                label={`${t('pages.treasury.settings.dailyCap')} (${rail.unit})`}
                type="text"
                inputMode="decimal"
                value={bands.dailyCap}
                onChange={(e) => patchRail(rail.id, { dailyCap: e.target.value })}
              />
            </div>
            <div className="treasury-refill-plan">
              <p className="treasury-refill-plan__title">{t('pages.treasury.settings.bandsPreview')}</p>
              <ul className="treasury-refill-plan__list">
                <li>
                  {t('pages.treasury.settings.lowEffective')}:{' '}
                  <strong>
                    {formatBand(low)} {rail.unit}
                  </strong>
                </li>
                {high != null ? (
                  <li>
                    {t('pages.treasury.settings.highEffective')}:{' '}
                    <strong>
                      {formatBand(high)} {rail.unit}
                    </strong>
                  </li>
                ) : (
                  <li>{t('pages.treasury.settings.noHigh')}</li>
                )}
              </ul>
              <p className="treasury-refill-plan__note">{t('pages.treasury.settings.bandsHint')}</p>
            </div>
          </article>
        );
      })}

      <article className="surface admin-settings-card">
        <h2 className="admin-settings-card__title">{t('pages.treasury.settings.safeguardsTitle')}</h2>
        <InputField
          id="treasury-policy-breaker"
          label={t('pages.treasury.settings.circuitLabel')}
          type="text"
          inputMode="numeric"
          value={draft.circuitBreakerFailures}
          onChange={(e) => patch({ circuitBreakerFailures: e.target.value })}
        />
        <p className="field__hint">{t('pages.treasury.settings.circuitHint')}</p>
      </article>

      <div className="treasury-settings-footer">
        <Button type="button" disabled>
          {t('pages.treasury.settings.save')}
        </Button>
        <p className="field__hint">{t('pages.treasury.settings.saveDisabledHint')}</p>
      </div>
    </div>
  );
}
