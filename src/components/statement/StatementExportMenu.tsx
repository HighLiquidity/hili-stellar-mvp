'use client';

import { useEffect, useRef, useState } from 'react';

import { ChevronDownIcon, DownloadIcon } from '@/components/Icons';
import type { LedgerQueryFilters } from '@/lib/ledger/filters';
import { STATEMENT_EXPORT_MAX_ROWS } from '@/lib/ledger/filters';
import { fetchLedgerForExport } from '@/lib/ledger/query-entries';
import { exportStatement, type StatementExportFormat } from '@/lib/ledger/export-statement';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';

const EXPORT_FORMATS: { value: StatementExportFormat; label: string }[] = [
  { value: 'csv', label: 'CSV' },
  { value: 'pdf', label: 'PDF' },
  { value: 'ofx', label: 'OFX' },
];

type StatementExportMenuProps = {
  filters: LedgerQueryFilters;
  onError: (message: string | null) => void;
};

export function StatementExportMenu({ filters, onError }: StatementExportMenuProps) {
  const { t, locale } = useI18n();
  const localeCode = locale === 'pt' ? 'pt-BR' : 'en-US';
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleExport = async (format: StatementExportFormat) => {
    setIsOpen(false);
    onError(null);
    setIsExporting(true);

    try {
      const result = await fetchLedgerForExport(supabase, filters, STATEMENT_EXPORT_MAX_ROWS);
      if (!result.ok) {
        onError(result.message);
        return;
      }
      if (result.transactions.length === 0) {
        onError(t('pages.statement.exportEmpty'));
        return;
      }

      const stamp = new Date().toISOString().slice(0, 10);
      await exportStatement(
        format,
        result.transactions,
        {
          deposit: t('pages.ledger.type.deposit'),
          withdraw: t('pages.ledger.type.withdraw'),
          onramp: t('pages.ledger.type.onramp'),
          offramp: t('pages.ledger.type.offramp'),
          cryptoPending: t('pages.ledger.cryptoHashPending'),
          fileBaseName: `extrato-${stamp}`,
        },
        localeCode,
      );
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="statement-export-menu" ref={menuRef}>
      <button
        type="button"
        className={`statement-export-menu__trigger${isOpen ? ' is-open' : ''}`}
        disabled={isExporting}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={t('pages.statement.export')}
        onClick={() => setIsOpen((open) => !open)}
      >
        <DownloadIcon width={17} height={17} aria-hidden="true" />
        <span>{isExporting ? t('pages.statement.exporting') : t('pages.statement.export')}</span>
        <ChevronDownIcon
          className="statement-export-menu__chevron"
          width={16}
          height={16}
          aria-hidden="true"
        />
      </button>

      {isOpen ? (
        <div className="statement-export-menu__dropdown" role="menu" aria-label={t('pages.statement.exportFormat')}>
          {EXPORT_FORMATS.map((format) => (
            <button
              key={format.value}
              type="button"
              role="menuitem"
              className="statement-export-menu__item"
              onClick={() => void handleExport(format.value)}
            >
              {format.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
