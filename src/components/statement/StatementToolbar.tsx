'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import type { LedgerQueryFilters, StatementPageSize } from '@/lib/ledger/filters';
import { STATEMENT_EXPORT_MAX_ROWS, STATEMENT_PAGE_SIZE_OPTIONS } from '@/lib/ledger/filters';
import { fetchLedgerForExport } from '@/lib/ledger/query-entries';
import { exportStatement, type StatementExportFormat } from '@/lib/ledger/export-statement';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';

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
  const { t, locale } = useI18n();
  const localeCode = locale === 'pt' ? 'pt-BR' : 'en-US';
  const [exportFormat, setExportFormat] = useState<StatementExportFormat>('csv');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async () => {
    setExportError(null);
    setIsExporting(true);
    try {
      const result = await fetchLedgerForExport(supabase, filters, STATEMENT_EXPORT_MAX_ROWS);
      if (!result.ok) {
        setExportError(result.message);
        return;
      }
      if (result.transactions.length === 0) {
        setExportError(t('pages.statement.exportEmpty'));
        return;
      }

      const stamp = new Date().toISOString().slice(0, 10);
      await exportStatement(exportFormat, result.transactions, {
        deposit: t('pages.ledger.type.deposit'),
        withdraw: t('pages.ledger.type.withdraw'),
        cryptoPending: t('pages.ledger.cryptoHashPending'),
        fileBaseName: `extrato-${stamp}`,
      }, localeCode);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <article className="surface statement-toolbar">
      <div className="statement-toolbar__title-row">
        <div>
          <p className="eyebrow">{t('pages.statement.eyebrow')}</p>
          <h2>{t('pages.statement.title')}</h2>
        </div>
        <div className="statement-toolbar__export">
          <label className="field statement-toolbar__export-format">
            <span className="field__label">{t('pages.statement.exportFormat')}</span>
            <select
              className="field__input field__select"
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as StatementExportFormat)}
              disabled={isExporting}
            >
              <option value="csv">CSV</option>
              <option value="pdf">PDF</option>
              <option value="ofx">OFX</option>
            </select>
          </label>
          <Button type="button" variant="secondary" disabled={isExporting} onClick={() => void handleExport()}>
            {isExporting ? t('pages.statement.exporting') : t('pages.statement.export')}
          </Button>
        </div>
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
