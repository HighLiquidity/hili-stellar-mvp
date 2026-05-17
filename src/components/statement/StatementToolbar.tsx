'use client';

import { useState } from 'react';

import { StatementExportMenu } from '@/components/statement/StatementExportMenu';
import { InputField } from '@/components/ui/InputField';
import type { LedgerQueryFilters, StatementPageSize } from '@/lib/ledger/filters';
import { STATEMENT_PAGE_SIZE_OPTIONS } from '@/lib/ledger/filters';
import { useI18n } from '@/lib/i18n';

type StatementToolbarProps = {
  filters: LedgerQueryFilters;
  pageSize: StatementPageSize;
  total: number;
  onFiltersChange: (patch: Partial<LedgerQueryFilters>) => void;
  onPageSizeChange: (size: StatementPageSize) => void;
};

export function StatementToolbar({
  filters,
  pageSize,
  total,
  onFiltersChange,
  onPageSizeChange,
}: StatementToolbarProps) {
  const { t } = useI18n();
  const [exportError, setExportError] = useState<string | null>(null);

  return (
    <article className="surface statement-toolbar">
      <div className="statement-toolbar__title-row">
        <div>
          <p className="eyebrow">{t('pages.statement.eyebrow')}</p>
          <h2>{t('pages.statement.title')}</h2>
        </div>
        <StatementExportMenu filters={filters} onError={setExportError} />
      </div>

      <div className="statement-toolbar__filters">
        <InputField
          id="statement-date-from"
          label={t('pages.statement.filterDateFrom')}
          type="date"
          value={filters.dateFrom ?? ''}
          onChange={(e) => onFiltersChange({ dateFrom: e.target.value })}
        />
        <InputField
          id="statement-date-to"
          label={t('pages.statement.filterDateTo')}
          type="date"
          value={filters.dateTo ?? ''}
          onChange={(e) => onFiltersChange({ dateTo: e.target.value })}
        />
        <label className="field">
          <span className="field__label">{t('pages.statement.filterType')}</span>
          <select
            className="field__input field__select"
            value={filters.type}
            onChange={(e) =>
              onFiltersChange({ type: e.target.value as LedgerQueryFilters['type'] })
            }
          >
            <option value="all">{t('pages.statement.filterTypeAll')}</option>
            <option value="deposit">{t('pages.ledger.type.deposit')}</option>
            <option value="withdraw">{t('pages.ledger.type.withdraw')}</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">{t('pages.statement.pageSize')}</span>
          <select
            className="field__input field__select"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value) as StatementPageSize)}
          >
            {STATEMENT_PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {t('pages.statement.pageSizeOption').replace('{{count}}', String(n))}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="statement-toolbar__summary">
        {t('pages.statement.resultsSummary')
          .replace('{{count}}', String(total))
          .replace('{{from}}', filters.dateFrom ?? '—')
          .replace('{{to}}', filters.dateTo ?? '—')}
      </p>

      {exportError ? (
        <p className="auth-inline-error" role="alert">
          {exportError}
        </p>
      ) : null}
    </article>
  );
}
