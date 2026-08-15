'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { LedgerTransactionList } from '@/components/ledger/LedgerTransactionList';
import { StatementPagination } from '@/components/statement/StatementPagination';
import { StatementToolbar } from '@/components/statement/StatementToolbar';
import { useAuth } from '@/hooks/useAuth';
import { useBrhRampAccess } from '@/hooks/useRampAvailability';
import { useStatementLedger } from '@/hooks/useStatementLedger';
import { useI18n } from '@/lib/i18n';

export function StatementPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { isLoading: authLoading, isAuthorized } = useAuth();
  const { canAccess } = useBrhRampAccess();
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

  useEffect(() => {
    if (authLoading || !isAuthorized) return;
    if (!canAccess) {
      router.replace('/app/dashboard');
    }
  }, [authLoading, canAccess, isAuthorized, router]);

  if (authLoading || !canAccess) {
    return (
      <section className="dashboard-layout">
        <article className="surface">
          <p className="surface__lead">{t('pages.settings.loading')}</p>
        </article>
      </section>
    );
  }

  return (
    <section className="dashboard-layout">
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
