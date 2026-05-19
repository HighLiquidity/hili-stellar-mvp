'use client';

import Link from 'next/link';

import { LedgerTransactionList } from '@/components/ledger/LedgerTransactionList';
import { useBrhBalance } from '@/hooks/useBrhBalance';
import { useLedgerEntries } from '@/hooks/useLedgerEntries';
import { formatBrhAmount, formatBrlApprox } from '@/lib/format/brh-display';
import { useI18n } from '@/lib/i18n';

const DASHBOARD_RECENT_LIMIT = 8;
const DASHBOARD_FETCH_LIMIT = 200;

function formatCurrency(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(value);
}

export function DashboardPage() {
  const { locale, t } = useI18n();
  const localeCode = locale === 'pt' ? 'pt-BR' : 'en-US';
  const { balanceNumber, isLoading: isBrhBalanceLoading } = useBrhBalance();
  const {
    transactions,
    incomingBrl,
    outgoingBrl,
    isLoading: isLedgerLoading,
    error: ledgerError,
  } = useLedgerEntries(DASHBOARD_FETCH_LIMIT);

  const recentTransactions = transactions.slice(0, DASHBOARD_RECENT_LIMIT);

  return (
    <section className="dashboard-layout">
      <article className="surface surface--hero dashboard-hero">
        <div>
          <p className="eyebrow">{t('pages.dashboard.eyebrow')}</p>
        </div>

        <div className="dashboard-hero__balance">
          <span className="dashboard-hero__label">{t('pages.dashboard.brhBalance')}</span>
          <strong className="dashboard-hero__brh-amount">
            {isBrhBalanceLoading
              ? '…'
              : formatBrhAmount(balanceNumber, localeCode)}
            <span className="dashboard-hero__brh-ticker">BRH</span>
          </strong>
          <p className="dashboard-hero__brh-equiv">
            ≈{' '}
            {isBrhBalanceLoading ? '…' : formatBrlApprox(balanceNumber, localeCode)}
          </p>
          <p className="dashboard-hero__hint">{t('pages.dashboard.brhBalanceHint')}</p>
        </div>
      </article>

      <div className="dashboard-summary-grid">
        <article className="surface dashboard-summary-card">
          <span className="dashboard-summary-card__label">{t('pages.dashboard.brhBalance')}</span>
          <strong className="dashboard-summary-card__brh">
            {isBrhBalanceLoading ? '…' : formatBrhAmount(balanceNumber, localeCode)}
            <span className="dashboard-summary-card__brh-ticker">BRH</span>
          </strong>
          <span className="dashboard-summary-card__brh-equiv">
            ≈{' '}
            {isBrhBalanceLoading ? '…' : formatBrlApprox(balanceNumber, localeCode)}
          </span>
        </article>

        <article className="surface dashboard-summary-card">
          <span className="dashboard-summary-card__label">{t('pages.dashboard.incomingVolume')}</span>
          <strong>
            {isLedgerLoading ? '…' : formatCurrency(incomingBrl, localeCode)}
          </strong>
          <span className="dashboard-summary-card__brh-equiv">
            ≈ {isLedgerLoading ? '…' : formatBrhAmount(incomingBrl, localeCode)} BRH
          </span>
        </article>

        <article className="surface dashboard-summary-card">
          <span className="dashboard-summary-card__label">{t('pages.dashboard.outgoingVolume')}</span>
          <strong>
            {isLedgerLoading ? '…' : formatCurrency(outgoingBrl, localeCode)}
          </strong>
          <span className="dashboard-summary-card__brh-equiv">
            ≈ {isLedgerLoading ? '…' : formatBrhAmount(outgoingBrl, localeCode)} BRH
          </span>
        </article>

        <article className="surface dashboard-summary-card">
          <span className="dashboard-summary-card__label">{t('pages.dashboard.recentActivity')}</span>
          <strong>{isLedgerLoading ? '…' : recentTransactions.length}</strong>
        </article>
      </div>

      <article className="surface dashboard-transactions">
        <div className="dashboard-section-heading">
          <div>
            <p className="eyebrow">{t('pages.dashboard.historyEyebrow')}</p>
            <h3>{t('pages.dashboard.historyTitle')}</h3>
          </div>
          <Link href="/app/statement" className="auth-text-link dashboard-section-link">
            {t('pages.dashboard.viewStatement')}
          </Link>
        </div>

        {ledgerError ? (
          <p className="auth-inline-error" role="alert">
            {t('pages.dashboard.ledgerLoadError')}
          </p>
        ) : null}

        <LedgerTransactionList
          transactions={recentTransactions}
          isLoading={isLedgerLoading}
          emptyMessage={t('pages.dashboard.ledgerEmpty')}
          showCryptoHash
          compact
        />
      </article>
    </section>
  );
}
