'use client';

import { CryptoTxHashLink } from '@/components/ledger/CryptoTxHashLink';
import { formatBrhAmount } from '@/lib/format/brh-display';
import type { LedgerTransaction } from '@/lib/ledger/types';
import { useI18n } from '@/lib/i18n';

function formatCurrency(value: number, localeCode: string) {
  return new Intl.NumberFormat(localeCode, {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string, localeCode: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(localeCode, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function shortenHash(hash: string, head = 8, tail = 6): string {
  const trimmed = hash.trim();
  if (trimmed.length <= head + tail + 3) return trimmed;
  return `${trimmed.slice(0, head)}…${trimmed.slice(-tail)}`;
}

type LedgerTransactionListProps = {
  transactions: LedgerTransaction[];
  isLoading?: boolean;
  emptyMessage?: string;
  showCryptoHash?: boolean;
  compact?: boolean;
};

export function LedgerTransactionList({
  transactions,
  isLoading = false,
  emptyMessage,
  showCryptoHash = true,
  compact = false,
}: LedgerTransactionListProps) {
  const { t, locale } = useI18n();
  const localeCode = locale === 'pt' ? 'pt-BR' : 'en-US';

  if (isLoading) {
    return <p className="surface__lead ledger-list__status">{t('pages.ledger.loading')}</p>;
  }

  if (transactions.length === 0) {
    return (
      <p className="surface__lead ledger-list__status">
        {emptyMessage ?? t('pages.ledger.empty')}
      </p>
    );
  }

  return (
    <div className={`transaction-list${compact ? ' transaction-list--compact' : ''}`} role="list">
      {transactions.map((transaction) => {
        const amountNum = Number(transaction.amountBrl.replace(',', '.'));
        const amountPrefix = transaction.type === 'deposit' ? '+' : '-';
        const toneClass = transaction.type === 'deposit' ? 'is-positive' : 'is-negative';
        const typeLabel =
          transaction.type === 'deposit'
            ? t('pages.ledger.type.deposit')
            : t('pages.ledger.type.withdraw');

        return (
          <article key={transaction.id} className="transaction-item" role="listitem">
            <div className="transaction-item__main">
              <div className="transaction-item__heading">
                <strong>{typeLabel}</strong>
                <span className="transaction-status transaction-status--completed">
                  {t('pages.ledger.status.completed')}
                </span>
              </div>
              {transaction.beneficiaryName && transaction.type === 'withdraw' ? (
                <p className="transaction-item__subline">
                  {t('pages.ledger.beneficiary')}: {transaction.beneficiaryName}
                </p>
              ) : null}
              {showCryptoHash ? (
                <p className="transaction-item__subline transaction-item__hash">
                  {t('pages.ledger.cryptoHash')}:{' '}
                  {transaction.txHash ? (
                    <CryptoTxHashLink txHash={transaction.txHash} />
                  ) : (
                    <span className="transaction-item__hash-pending">{t('pages.ledger.cryptoHashPending')}</span>
                  )}
                </p>
              ) : null}
            </div>

            <div className="transaction-item__meta">
              <strong className={`transaction-item__amount ${toneClass}`}>
                {amountPrefix}
                {formatCurrency(Number.isFinite(amountNum) ? amountNum : 0, localeCode)}
              </strong>
              <span className="transaction-item__amount-equivalent">
                ≈ {amountPrefix}
                {formatBrhAmount(Number.isFinite(amountNum) ? amountNum : 0, localeCode)} BRH
              </span>
              <span>{formatDate(transaction.createdAt, localeCode)}</span>
              {transaction.pixE2eId ? (
                <span className="transaction-item__e2e" title={transaction.pixE2eId}>
                  PIX E2E: {shortenHash(transaction.pixE2eId, 6, 4)}
                </span>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
