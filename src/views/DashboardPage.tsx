'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import {
  getMyClientComplianceAction,
  submitClientComplianceForReviewAction,
} from '@/app/actions/client-compliance';
import { LedgerTransactionList } from '@/components/ledger/LedgerTransactionList';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useBrhBalance } from '@/hooks/useBrhBalance';
import { useLedgerEntries } from '@/hooks/useLedgerEntries';
import type { KybStatus } from '@/lib/clients/compliance-types';
import { formatBrhAmount, formatBrlApprox } from '@/lib/format/brh-display';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';

const DASHBOARD_RECENT_LIMIT = 8;
const DASHBOARD_FETCH_LIMIT = 200;

function formatCurrency(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatUsdcAmount(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function DashboardPage() {
  const { locale, t } = useI18n();
  const { profile } = useAuth();
  const localeCode = locale === 'pt' ? 'pt-BR' : 'en-US';
  const isClientAdmin = profile?.role === 'client_admin';
  const [kybStatus, setKybStatus] = useState<KybStatus | null>(null);
  const [complianceMessage, setComplianceMessage] = useState<string | null>(null);
  const [isComplianceLoading, setIsComplianceLoading] = useState(false);
  const [isSubmittingCompliance, setIsSubmittingCompliance] = useState(false);
  const { balanceNumber, isLoading: isBrhBalanceLoading } = useBrhBalance();
  const {
    transactions,
    incomingBrl,
    outgoingBrl,
    usdcReceived,
    usdcSent,
    isLoading: isLedgerLoading,
    error: ledgerError,
  } = useLedgerEntries(DASHBOARD_FETCH_LIMIT);

  const recentTransactions = transactions.slice(0, DASHBOARD_RECENT_LIMIT);

  const loadCompliance = useCallback(async () => {
    if (!isClientAdmin) {
      setKybStatus(null);
      return;
    }

    setIsComplianceLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;

      const result = await getMyClientComplianceAction(token);
      if (result.ok) {
        setKybStatus(result.data.kyb_status);
      }
    } finally {
      setIsComplianceLoading(false);
    }
  }, [isClientAdmin]);

  useEffect(() => {
    void loadCompliance();
  }, [loadCompliance]);

  const complianceHint = (status: KybStatus | null) => {
    if (!status || status === 'approved') return t('pages.dashboard.compliance.approvedHint');
    if (status === 'pending') return t('pages.dashboard.compliance.pendingHint');
    if (status === 'rejected') return t('pages.dashboard.compliance.rejectedHint');
    return t('pages.dashboard.compliance.notStartedHint');
  };

  const handleSubmitCompliance = async () => {
    setComplianceMessage(null);
    setIsSubmittingCompliance(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;

      const result = await submitClientComplianceForReviewAction(token);
      if (!result.ok) {
        setComplianceMessage(result.message);
        return;
      }

      setKybStatus(result.data.kyb_status);
      setComplianceMessage(t('pages.dashboard.compliance.submitReviewSuccess'));
    } finally {
      setIsSubmittingCompliance(false);
    }
  };

  return (
    <section className="dashboard-layout">
      {isClientAdmin && kybStatus && kybStatus !== 'approved' ? (
        <article className="surface dashboard-compliance-banner">
          <h3>{t('pages.dashboard.compliance.title')}</h3>
          <p className="surface__lead">
            {t('pages.dashboard.compliance.kybLabel')}: <strong>{kybStatus}</strong>
          </p>
          <p className="surface__lead">{complianceHint(kybStatus)}</p>
          {complianceMessage ? (
            <p className="form-success-message" role="status">
              {complianceMessage}
            </p>
          ) : null}
          {kybStatus === 'not_started' || kybStatus === 'rejected' ? (
            <Button
              type="button"
              variant="secondary"
              disabled={isComplianceLoading || isSubmittingCompliance}
              onClick={() => void handleSubmitCompliance()}
            >
              {t('pages.dashboard.compliance.submitReview')}
            </Button>
          ) : null}
        </article>
      ) : null}

      <div className="dashboard-overview">
        <p className="eyebrow dashboard-overview__eyebrow">{t('pages.dashboard.overviewEyebrow')}</p>
        <div className="dashboard-summary-grid">
          <article className="surface dashboard-summary-card dashboard-summary-card--brh">
            <span className="dashboard-summary-card__label">{t('pages.dashboard.brhBalance')}</span>
            <strong className="dashboard-summary-card__brh">
              {isBrhBalanceLoading ? '…' : formatBrhAmount(balanceNumber, localeCode)}
              <span className="dashboard-summary-card__brh-ticker">BRH</span>
            </strong>
            <span className="dashboard-summary-card__brh-equiv">
              ≈ {isBrhBalanceLoading ? '…' : formatBrlApprox(balanceNumber, localeCode)}
            </span>
            <span className="dashboard-summary-card__brh-equiv">{t('pages.dashboard.brhBalanceHint')}</span>
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
            <span className="dashboard-summary-card__label">{t('pages.dashboard.usdcReceived')}</span>
            <strong className="dashboard-summary-card__usdc">
              {isLedgerLoading ? '…' : formatUsdcAmount(usdcReceived, localeCode)}
              <span className="dashboard-summary-card__usdc-ticker">USDC</span>
            </strong>
            <span className="dashboard-summary-card__brh-equiv">
              {t('pages.dashboard.usdcReceivedHint')}
            </span>
          </article>

          <article className="surface dashboard-summary-card">
            <span className="dashboard-summary-card__label">{t('pages.dashboard.usdcSent')}</span>
            <strong className="dashboard-summary-card__usdc">
              {isLedgerLoading ? '…' : formatUsdcAmount(usdcSent, localeCode)}
              <span className="dashboard-summary-card__usdc-ticker">USDC</span>
            </strong>
            <span className="dashboard-summary-card__brh-equiv">
              {t('pages.dashboard.usdcSentHint')}
            </span>
          </article>
        </div>
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
