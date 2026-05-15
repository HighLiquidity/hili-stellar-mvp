'use client';

import { useMemo } from 'react';
import { useI18n } from '../lib/i18n';

type TransactionDirection = 'deposit' | 'withdraw';
type TransactionStatus = 'completed' | 'processing' | 'scheduled';

interface TransactionItem {
  id: string;
  direction: TransactionDirection;
  descriptionKey: string;
  amount: number;
  status: TransactionStatus;
  createdAt: string;
}

const recentTransactions: TransactionItem[] = [
  {
    id: 'TRX-1048',
    direction: 'deposit',
    descriptionKey: 'treasuryTopUp',
    amount: 125000,
    status: 'completed',
    createdAt: '2026-05-14T11:20:00-03:00',
  },
  {
    id: 'TRX-1043',
    direction: 'withdraw',
    descriptionKey: 'corporateSettlement',
    amount: 18250,
    status: 'processing',
    createdAt: '2026-05-14T09:05:00-03:00',
  },
  {
    id: 'TRX-1037',
    direction: 'deposit',
    descriptionKey: 'customerFunding',
    amount: 6400,
    status: 'completed',
    createdAt: '2026-05-13T16:40:00-03:00',
  },
  {
    id: 'TRX-1031',
    direction: 'withdraw',
    descriptionKey: 'treasuryRebalance',
    amount: 9200,
    status: 'scheduled',
    createdAt: '2026-05-13T10:15:00-03:00',
  },
];

function formatBRH(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCurrency(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function DashboardPage() {
  const { locale, t } = useI18n();
  const localeCode = locale === 'pt' ? 'pt-BR' : 'en-US';

  const summary = useMemo(
    () => ({
      availableBalance: 108430.45,
      incomingVolume: 131400,
      outgoingVolume: 27450,
      transactionCount: recentTransactions.length,
    }),
    [],
  );

  return (
    <section className="dashboard-layout">
      <article className="surface surface--hero dashboard-hero">
        <div>
          <p className="eyebrow">{t('pages.dashboard.eyebrow')}</p>
          <h2>{t('pages.dashboard.title')}</h2>
          <p className="surface__lead">{t('pages.dashboard.description')}</p>
        </div>

        <div className="dashboard-hero__balance">
          <span className="dashboard-hero__label">{t('pages.dashboard.brhBalance')}</span>
          <strong className="dashboard-hero__brh-amount">
            {formatBRH(summary.availableBalance, localeCode)}
            <span className="dashboard-hero__brh-ticker">BRH</span>
          </strong>
          <p className="dashboard-hero__brh-equiv">
            ≈ {formatCurrency(summary.availableBalance, localeCode)}
          </p>
          <p className="dashboard-hero__hint">{t('pages.dashboard.brhBalanceHint')}</p>
        </div>
      </article>

      <div className="dashboard-summary-grid">
        <article className="surface dashboard-summary-card">
          <span className="dashboard-summary-card__label">{t('pages.dashboard.brhBalance')}</span>
          <strong className="dashboard-summary-card__brh">
            {formatBRH(summary.availableBalance, localeCode)}
            <span className="dashboard-summary-card__brh-ticker">BRH</span>
          </strong>
          <span className="dashboard-summary-card__brh-equiv">
            ≈ {formatCurrency(summary.availableBalance, localeCode)}
          </span>
        </article>

        <article className="surface dashboard-summary-card">
          <span className="dashboard-summary-card__label">{t('pages.dashboard.incomingVolume')}</span>
          <strong>{formatCurrency(summary.incomingVolume, localeCode)}</strong>
          <span className="dashboard-summary-card__brh-equiv">
            ≈ {formatBRH(summary.incomingVolume, localeCode)} BRH
          </span>
        </article>

        <article className="surface dashboard-summary-card">
          <span className="dashboard-summary-card__label">{t('pages.dashboard.outgoingVolume')}</span>
          <strong>{formatCurrency(summary.outgoingVolume, localeCode)}</strong>
          <span className="dashboard-summary-card__brh-equiv">
            ≈ {formatBRH(summary.outgoingVolume, localeCode)} BRH
          </span>
        </article>

        <article className="surface dashboard-summary-card">
          <span className="dashboard-summary-card__label">{t('pages.dashboard.recentActivity')}</span>
          <strong>{summary.transactionCount}</strong>
        </article>
      </div>

      <article className="surface dashboard-transactions">
        <div className="dashboard-section-heading">
          <div>
            <p className="eyebrow">{t('pages.dashboard.historyEyebrow')}</p>
            <h3>{t('pages.dashboard.historyTitle')}</h3>
          </div>
          <span className="status-pill dashboard-section-badge">{t('pages.dashboard.historyBadge')}</span>
        </div>

        <div className="transaction-list" role="list">
          {recentTransactions.map((transaction) => {
            const amountPrefix = transaction.direction === 'deposit' ? '+' : '-';
            const toneClass = transaction.direction === 'deposit' ? 'is-positive' : 'is-negative';

            return (
              <article key={transaction.id} className="transaction-item" role="listitem">
                <div className="transaction-item__main">
                  <div className="transaction-item__heading">
                    <strong>{transaction.id}</strong>
                    <span className={`transaction-status transaction-status--${transaction.status}`}>
                      {t(`pages.dashboard.status.${transaction.status}`)}
                    </span>
                  </div>
                  <p>{t(`pages.dashboard.transactions.${transaction.descriptionKey}`)}</p>
                </div>

                <div className="transaction-item__meta">
                  <strong className={`transaction-item__amount ${toneClass}`}>
                    {amountPrefix}
                    {formatCurrency(transaction.amount, localeCode)}
                  </strong>
                  <span>{formatDate(transaction.createdAt, localeCode)}</span>
                </div>
              </article>
            );
          })}
        </div>
      </article>
    </section>
  );
}