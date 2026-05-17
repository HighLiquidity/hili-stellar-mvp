'use client';

import { LedgerTransactionList } from '@/components/ledger/LedgerTransactionList';
import { StatementPagination } from '@/components/statement/StatementPagination';
import { StatementToolbar } from '@/components/statement/StatementToolbar';
import { useStatementLedger } from '@/hooks/useStatementLedger';
import { useI18n } from '@/lib/i18n';

export function StatementPage() {
  const { t } = useI18n();
  const {
    transactions,
    total,
    page,
    pageSize,
    filters,
    setPage,
    setPageSize,
    setFilters,
    isLoading,
    error,
  } = useStatementLedger(25);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="page-grid page-grid--single statement-layout">
      <StatementToolbar
        filters={filters}
        pageSize={pageSize}
        total={total}
        onFiltersChange={setFilters}
        onPageSizeChange={setPageSize}
      />

      <article className="surface dashboard-transactions statement-ledger-card">
        {error ? (
          <p className="auth-inline-error" role="alert">
            {t('pages.statement.loadError')}
            {`: ${error}`}
          </p>
        ) : null}

        <LedgerTransactionList
          transactions={transactions}
          isLoading={isLoading}
          emptyMessage={t('pages.statement.empty')}
          showCryptoHash
        />

        <StatementPagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          onPageChange={setPage}
          disabled={isLoading}
        />
      </article>
    </section>
  );
}
