'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { RefreshIcon } from '@/components/Icons';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useI18n } from '@/lib/i18n';
import { buildStellarExpertAccountUrl } from '@/lib/stellar/explorer-url';
import type { TreasuryOverviewResponse } from '@/lib/treasury/types';

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function formatAmount(value: string, fractionDigits = 2): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  });
}

function pocketErrorMessage(
  pocket: { ok: true } | { ok: false; error: string } | undefined,
  fallback: string,
): string {
  if (pocket && !pocket.ok) return pocket.error;
  return fallback;
}

function PocketError({ message }: { message: string }) {
  return <p className="treasury-pocket__error">{message}</p>;
}

type AssetRowProps = {
  ticker: string;
  amount: string;
  fractionDigits?: number;
  detail?: string;
};

function AssetRow({ ticker, amount, fractionDigits = 2, detail }: AssetRowProps) {
  return (
    <div className="treasury-asset">
      <div className="treasury-asset__main">
        <span className="treasury-asset__ticker">{ticker}</span>
        <strong className="treasury-asset__amount">{formatAmount(amount, fractionDigits)}</strong>
      </div>
      {detail ? (
        <span className="treasury-asset__detail" title={detail}>
          {detail}
        </span>
      ) : null}
    </div>
  );
}

export function TreasuryPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { profile, isLoading: authLoading, isAuthorized } = useAuth();

  const [overview, setOverview] = useState<TreasuryOverviewResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (authLoading || !isAuthorized) return;
    if (profile?.role !== 'admin') {
      router.replace('/app/dashboard');
    }
  }, [authLoading, isAuthorized, profile?.role, router]);

  const loadOverview = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    setLoadError(null);
    if (silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const token = await getAccessToken();
      if (!token) {
        setLoadError(t('pages.treasury.errors.session'));
        setOverview(null);
        return;
      }

      const response = await fetch('/api/treasury/overview', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setLoadError(body?.error?.trim() || t('pages.treasury.errors.loadFailed'));
        setOverview(null);
        return;
      }

      const json = (await response.json()) as TreasuryOverviewResponse;
      setOverview(json);
    } catch {
      setLoadError(t('pages.treasury.errors.loadFailed'));
      setOverview(null);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    if (authLoading || !isAuthorized || profile?.role !== 'admin') return;
    void loadOverview();
  }, [authLoading, isAuthorized, profile?.role, loadOverview]);

  if (authLoading || (!isAuthorized && !profile)) {
    return (
      <section className="dashboard-layout">
        <article className="surface">
          <p className="surface__lead">{t('pages.treasury.loading')}</p>
        </article>
      </section>
    );
  }

  if (profile?.role !== 'admin') {
    return null;
  }

  const pockets = overview?.pockets;
  const pending = overview?.pendingRefills;
  const distributorExplorerUrl =
    pockets?.distributor.ok
      ? buildStellarExpertAccountUrl(
          pockets.distributor.address,
          pockets.distributor.stellarNetwork,
        )
      : null;

  return (
    <section className="dashboard-layout treasury-page">
      <article className="surface treasury-page__intro">
        <div className="treasury-page__header">
          <div className="treasury-page__intro-copy">
            <p className="eyebrow">{t('pages.treasury.eyebrow')}</p>
            <h2 className="user-management-card__title">{t('pages.treasury.title')}</h2>
            <p className="surface__lead">{t('pages.treasury.description')}</p>
            {overview?.generatedAt ? (
              <p className="surface__lead treasury-page__synced">
                {t('pages.treasury.lastSync')}: {new Date(overview.generatedAt).toLocaleString()}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className={`treasury-refresh${isRefreshing ? ' is-busy' : ''}`}
            disabled={isLoading || isRefreshing}
            onClick={() => void loadOverview({ silent: true })}
            aria-label={t('pages.treasury.refresh')}
            title={t('pages.treasury.refresh')}
          >
            <RefreshIcon width={16} height={16} aria-hidden="true" />
          </button>
        </div>

        {loadError ? (
          <p className="auth-inline-error" role="alert">
            {loadError}
          </p>
        ) : null}
      </article>

      {isLoading && !overview ? (
        <article className="surface">
          <p className="surface__lead">{t('pages.treasury.loading')}</p>
        </article>
      ) : (
        <>
          <div className="treasury-summary-grid">
            <article className="surface treasury-pocket">
              <header className="treasury-pocket__header">
                <span className="treasury-pocket__label">{t('pages.treasury.pockets.corpx')}</span>
              </header>
              {pockets?.corpx.ok ? (
                <div className="treasury-pocket__assets">
                  <AssetRow
                    ticker={pockets.corpx.currency || 'BRL'}
                    amount={pockets.corpx.available}
                    detail={`${t('pages.treasury.reserved')}: ${formatAmount(pockets.corpx.reserved)} · ${t('pages.treasury.total')}: ${formatAmount(pockets.corpx.total)}`}
                  />
                </div>
              ) : (
                <PocketError message={pocketErrorMessage(pockets?.corpx, t('pages.treasury.errors.unavailable'))} />
              )}
            </article>

            <article className="surface treasury-pocket">
              <header className="treasury-pocket__header">
                <span className="treasury-pocket__label">{t('pages.treasury.pockets.binance')}</span>
              </header>
              {pockets?.binance.ok ? (
                <div className="treasury-pocket__assets">
                  <AssetRow
                    ticker="BRL"
                    amount={pockets.binance.brl.free}
                    detail={`${t('pages.treasury.locked')}: ${formatAmount(pockets.binance.brl.locked)}`}
                  />
                  <AssetRow
                    ticker="USDC"
                    amount={pockets.binance.usdc.free}
                    fractionDigits={4}
                    detail={`${t('pages.treasury.locked')}: ${formatAmount(pockets.binance.usdc.locked, 4)}`}
                  />
                </div>
              ) : (
                <PocketError
                  message={pocketErrorMessage(pockets?.binance, t('pages.treasury.errors.unavailable'))}
                />
              )}
            </article>

            <article className="surface treasury-pocket">
              <header className="treasury-pocket__header treasury-pocket__header--row">
                <span className="treasury-pocket__label">{t('pages.treasury.pockets.distributor')}</span>
                {distributorExplorerUrl ? (
                  <a
                    className="treasury-pocket__explorer-link"
                    href={distributorExplorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t('pages.treasury.explorerLink')}
                  </a>
                ) : null}
              </header>
              {pockets?.distributor.ok ? (
                <div className="treasury-pocket__assets">
                  <AssetRow ticker="USDC" amount={pockets.distributor.usdc} fractionDigits={4} />
                  <AssetRow ticker="XLM" amount={pockets.distributor.xlm} fractionDigits={4} />
                </div>
              ) : (
                <PocketError
                  message={pocketErrorMessage(pockets?.distributor, t('pages.treasury.errors.unavailable'))}
                />
              )}
            </article>

            <article className="surface treasury-pocket treasury-pocket--muted">
              <header className="treasury-pocket__header">
                <span className="treasury-pocket__label" title={t('pages.treasury.brhHint')}>
                  {t('pages.treasury.pockets.brh')}
                </span>
              </header>
              {pockets?.brh.ok ? (
                <div className="treasury-pocket__assets">
                  <AssetRow ticker="BRH" amount={pockets.brh.balance} />
                </div>
              ) : (
                <PocketError
                  message={pocketErrorMessage(pockets?.brh, t('pages.treasury.errors.unavailable'))}
                />
              )}
            </article>
          </div>

          <section className="surface treasury-pending">
            <div className="dashboard-section-heading">
              <h2>{t('pages.treasury.pendingTitle')}</h2>
              <span className="dashboard-section-badge">
                {pending?.count ?? 0} {t('pages.treasury.pendingCount')}
              </span>
            </div>
            <p className="surface__lead">{t('pages.treasury.pendingHint')}</p>

            {!pending?.items.length ? (
              <p className="surface__lead">{t('pages.treasury.pendingEmpty')}</p>
            ) : (
              <div className="user-management-table-wrap">
                <table className="user-management-table">
                  <thead>
                    <tr>
                      <th>{t('pages.treasury.columns.orderId')}</th>
                      <th>{t('pages.treasury.columns.status')}</th>
                      <th>{t('pages.treasury.columns.amountBrl')}</th>
                      <th>{t('pages.treasury.columns.amountUsdc')}</th>
                      <th>{t('pages.treasury.columns.updatedAt')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.items.map((item) => (
                      <tr key={item.orderId}>
                        <td>
                          <code>{item.orderId.slice(0, 8)}…</code>
                        </td>
                        <td>{item.status}</td>
                        <td>{formatAmount(item.amountBrl)}</td>
                        <td>{formatAmount(item.amountUsdc, 4)}</td>
                        <td>{new Date(item.updatedAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
