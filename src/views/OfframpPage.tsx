'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useRouter } from 'next/navigation';

import { CryptoTxHashLink } from '@/components/ledger/CryptoTxHashLink';
import { RampCollapsiblePanel } from '@/components/RampCollapsiblePanel';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import type {
  OfframpLockResponse,
  OfframpOrderResponse,
  OfframpOrderStatus,
  OfframpQuoteResponse,
} from '@/lib/offramp/contracts';

const CLOCK_TICK_INTERVAL_MS = 1_000;

const EMPTY_TIMELINE = {
  quotedAt: '',
  usdcReceivedAt: null,
  pixSentAt: null,
  brhRecordedAt: null,
  fxSettledAt: null,
  completeAt: null,
  expiredAt: null,
  refundedAt: null,
} as const;

const EMPTY_REFERENCES = {
  brhIssueExternalId: null,
  brhRedemptionExternalId: null,
  binanceClientOrderId: null,
} as const;

type OfframpReconcileResponse = {
  ok: true;
  order: OfframpOrderResponse;
};

type TimelineStepState = 'completed' | 'current' | 'upcoming';
type StatusTone = 'neutral' | 'progress' | 'success' | 'warning' | 'danger';

function shouldPollOrder(status: OfframpOrderStatus) {
  if (status === 'quoted') return false;
  return status !== 'complete' && status !== 'failed' && status !== 'expired' && status !== 'refunded';
}

function getOrderPollIntervalMs(status: OfframpOrderStatus): number | null {
  if (!shouldPollOrder(status)) return null;

  switch (status) {
    case 'awaiting_deposit':
      return 6_000;
    case 'usdc_received':
      return 5_000;
    case 'pix_sent':
    case 'brh_recorded':
    case 'needs_review':
      return 12_000;
    case 'fx_settled':
      return 20_000;
    default:
      return 10_000;
  }
}

function orderFromQuote(quoted: OfframpQuoteResponse): OfframpOrderResponse {
  return {
    orderId: quoted.orderId,
    status: quoted.status,
    quote: quoted.quote,
    payout: { ...quoted.payout, providerTxId: null, endToEndId: null },
    deposit: null,
    timeline: { ...EMPTY_TIMELINE },
    references: { ...EMPTY_REFERENCES },
    failure: null,
  };
}

function mergeLockIntoOrder(
  previous: OfframpOrderResponse | null,
  locked: OfframpLockResponse,
): OfframpOrderResponse {
  const base =
    previous?.orderId === locked.orderId
      ? previous
      : {
          orderId: locked.orderId,
          status: 'quoted' as const,
          quote: locked.quote,
          payout: { ...locked.payout, providerTxId: null, endToEndId: null },
          deposit: null,
          timeline: { ...EMPTY_TIMELINE },
          references: { ...EMPTY_REFERENCES },
          failure: null,
        };

  return {
    ...base,
    orderId: locked.orderId,
    status: locked.status,
    quote: locked.quote,
    payout: {
      ...locked.payout,
      providerTxId: base.payout.providerTxId,
      endToEndId: base.payout.endToEndId,
    },
    deposit: {
      ...locked.deposit,
      rampOperationId: null,
      receivedAmount: null,
      txHash: null,
    },
  };
}

function shouldBlockInputs(status: OfframpOrderStatus) {
  return (
    status === 'quoted' ||
    status === 'awaiting_deposit' ||
    status === 'usdc_received' ||
    status === 'pix_sent' ||
    status === 'brh_recorded' ||
    status === 'fx_settled' ||
    status === 'needs_review'
  );
}

function getStatusTone(status: OfframpOrderStatus): StatusTone {
  switch (status) {
    case 'complete':
      return 'success';
    case 'needs_review':
    case 'expired':
      return 'warning';
    case 'failed':
    case 'refunded':
      return 'danger';
    case 'awaiting_deposit':
    case 'usdc_received':
    case 'pix_sent':
    case 'brh_recorded':
    case 'fx_settled':
      return 'progress';
    default:
      return 'neutral';
  }
}

function getProgressIndex(order: OfframpOrderResponse) {
  switch (order.status) {
    case 'quoted':
      return 0;
    case 'awaiting_deposit':
      return 1;
    case 'usdc_received':
      return 2;
    case 'pix_sent':
      return 3;
    case 'brh_recorded':
    case 'fx_settled':
      return 4;
    case 'complete':
      return 5;
    default:
      if (order.timeline.completeAt) return 5;
      if (order.timeline.brhRecordedAt || order.timeline.fxSettledAt) return 4;
      if (order.timeline.pixSentAt) return 3;
      if (order.timeline.usdcReceivedAt) return 2;
      if (order.deposit) return 1;
      return 0;
  }
}

function isQuoteExpiredAt(expiresAt: string | null | undefined, nowMs: number) {
  if (!expiresAt) return false;
  const targetMs = Date.parse(expiresAt);
  if (!Number.isFinite(targetMs)) return false;
  return targetMs <= nowMs;
}

function formatRemainingMs(targetIso: string | null | undefined, nowMs: number) {
  if (!targetIso) return null;
  const targetMs = Date.parse(targetIso);
  if (!Number.isFinite(targetMs)) return null;

  const diff = Math.max(0, targetMs - nowMs);
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatDateTime(value: string | null | undefined, localeCode: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(localeCode, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function formatBrlAmount(value: string, localeCode: string) {
  const numeric = Number(value.replace(',', '.'));
  if (!Number.isFinite(numeric)) return value;
  return new Intl.NumberFormat(localeCode, {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(numeric);
}

function formatUsdcAmount(value: string, localeCode: string) {
  const numeric = Number(value.replace(',', '.'));
  if (!Number.isFinite(numeric)) return value;
  return new Intl.NumberFormat(localeCode, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  }).format(numeric);
}

async function fetchOfframpJson<T>(
  accessToken: string,
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  let payload: Record<string, unknown> | null = null;

  if (text) {
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message = payload && typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

type OfframpPageProps = {
  initialOrderId?: string | null;
};

export function OfframpPage({ initialOrderId }: OfframpPageProps = {}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { session, profile, isLoading: authLoading, isAuthorized } = useAuth();
  const localeCode = locale === 'pt' ? 'pt-BR' : 'en-US';
  const accessToken = session?.access_token ?? null;

  const [amountUsdc, setAmountUsdc] = useState('');
  const [payoutPixKey, setPayoutPixKey] = useState('');
  const [payoutBeneficiaryName, setPayoutBeneficiaryName] = useState('');

  const [order, setOrder] = useState<OfframpOrderResponse | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isLocking, setIsLocking] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<'address' | 'memo' | null>(null);
  const [summaryPanelOpen, setSummaryPanelOpen] = useState(true);
  const [depositPanelOpen, setDepositPanelOpen] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const hadDepositRef = useRef(false);
  const loadedInitialOrderRef = useRef<string | null>(null);

  const orderId = order?.orderId ?? null;
  const orderStatus = order?.status ?? null;
  const deposit = order?.deposit ?? null;
  const hasSideColumn = Boolean(order);
  const pollIntervalMs = !orderStatus ? null : getOrderPollIntervalMs(orderStatus);
  const isQuoteExpired =
    order?.status === 'expired' ||
    (order?.status === 'quoted' && isQuoteExpiredAt(order.quote.expiresAt, nowMs));
  const isQuoteReady = order?.status === 'quoted' && !isQuoteExpired;
  const isFlowLocked = Boolean(order && shouldBlockInputs(order.status));
  const canEditFormForNewQuote = Boolean(order?.status === 'quoted' && isQuoteExpired);
  const formFieldsLocked = (isFlowLocked && !canEditFormForNewQuote) || isQuoting || isLocking;
  const showQuoteFormActions = !isFlowLocked || Boolean(order && order.status === 'quoted');
  const canRetryReconciliation = Boolean(
    order &&
      order.status !== 'complete' &&
      order.status !== 'failed' &&
      order.status !== 'expired' &&
      order.status !== 'refunded' &&
      order.status !== 'quoted' &&
      order.status !== 'awaiting_deposit',
  );

  const quoteCountdown = order ? formatRemainingMs(order.quote.expiresAt, nowMs) : null;

  const statusLabel = useMemo(() => {
    if (!order) return t('pages.offramp.status.idle');
    switch (order.status) {
      case 'quoted':
        return t('pages.offramp.status.quoted');
      case 'awaiting_deposit':
        return t('pages.offramp.status.awaitingDeposit');
      case 'usdc_received':
        return t('pages.offramp.status.usdcReceived');
      case 'pix_sent':
        return t('pages.offramp.status.pixSent');
      case 'brh_recorded':
      case 'fx_settled':
        return t('pages.offramp.status.processing');
      case 'complete':
        return t('pages.offramp.status.complete');
      case 'expired':
        return t('pages.offramp.status.expired');
      case 'failed':
        return t('pages.offramp.status.failed');
      case 'refunded':
        return t('pages.offramp.status.refunded');
      case 'needs_review':
        return t('pages.offramp.status.needsReview');
    }
  }, [order, t]);

  const statusDescription = useMemo(() => {
    if (!order) return t('pages.offramp.statusDescription.idle');
    switch (order.status) {
      case 'quoted':
        return t('pages.offramp.statusDescription.quoted');
      case 'awaiting_deposit':
        return t('pages.offramp.statusDescription.awaitingDeposit');
      case 'usdc_received':
        return t('pages.offramp.statusDescription.usdcReceived');
      case 'pix_sent':
        return t('pages.offramp.statusDescription.pixSent');
      case 'brh_recorded':
      case 'fx_settled':
        return t('pages.offramp.statusDescription.processing');
      case 'complete':
        return t('pages.offramp.statusDescription.complete');
      case 'expired':
        return t('pages.offramp.statusDescription.expired');
      case 'failed':
        return order.failure?.reason || t('pages.offramp.statusDescription.failed');
      case 'refunded':
        return t('pages.offramp.statusDescription.refunded');
      case 'needs_review':
        return (
          order.failure?.needsReviewReason ||
          order.failure?.reason ||
          t('pages.offramp.statusDescription.needsReview')
        );
    }
  }, [order, t]);

  const timelineSteps = useMemo(() => {
    if (!order) return [];
    const progressIndex = getProgressIndex(order);
    const labels = [
      t('pages.offramp.timeline.quote'),
      t('pages.offramp.timeline.deposit'),
      t('pages.offramp.timeline.received'),
      t('pages.offramp.timeline.pix'),
      t('pages.offramp.timeline.processing'),
      t('pages.offramp.timeline.complete'),
    ];

    return labels.map((label, index) => {
      let state: TimelineStepState = 'upcoming';
      if (index < progressIndex || (order.status === 'complete' && index <= progressIndex)) {
        state = 'completed';
      } else if (index === progressIndex) {
        state = order.status === 'complete' ? 'completed' : 'current';
      }
      return { label, state };
    });
  }, [order, t]);

  useEffect(() => {
    if (authLoading || !isAuthorized) return;
    if (profile?.role !== 'admin') {
      router.replace('/app/dashboard');
    }
  }, [authLoading, isAuthorized, profile?.role, router]);

  const loadOrder = useCallback(
    async (id: string) => {
      if (!accessToken) throw new Error(t('pages.offramp.errors.session'));
      const nextOrder = await fetchOfframpJson<OfframpOrderResponse>(
        accessToken,
        `/api/offramp/orders/${encodeURIComponent(id)}`,
      );
      setOrder(nextOrder);
      return nextOrder;
    },
    [accessToken, t],
  );

  useEffect(() => {
    const id = initialOrderId?.trim();
    if (!accessToken || !id) return;
    if (loadedInitialOrderRef.current === id) return;

    loadedInitialOrderRef.current = id;
    void loadOrder(id).catch((error) => {
      loadedInitialOrderRef.current = null;
      setErrorMessage(error instanceof Error ? error.message : String(error));
    });
  }, [accessToken, initialOrderId, loadOrder]);

  useEffect(() => {
    if (!order?.quote.expiresAt) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), CLOCK_TICK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [order?.quote.expiresAt, order?.status]);

  useEffect(() => {
    const hasDepositPanel = Boolean(deposit);
    if (hasDepositPanel && !hadDepositRef.current) {
      setSummaryPanelOpen(false);
      setDepositPanelOpen(true);
    }
    if (!hasDepositPanel) setSummaryPanelOpen(true);
    hadDepositRef.current = hasDepositPanel;
  }, [deposit]);

  useEffect(() => {
    if (!orderId || !accessToken || pollIntervalMs == null) return;

    const activeOrderId = orderId;
    const token = accessToken;
    let cancelled = false;
    let inFlight = false;

    async function pollOrder() {
      if (cancelled || inFlight) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

      inFlight = true;
      try {
        const nextOrder = await fetchOfframpJson<OfframpOrderResponse>(
          token,
          `/api/offramp/orders/${encodeURIComponent(activeOrderId)}`,
        );
        if (!cancelled) setOrder(nextOrder);
      } catch {
        /* best-effort */
      } finally {
        inFlight = false;
      }
    }

    void pollOrder();
    const interval = window.setInterval(() => void pollOrder(), pollIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [accessToken, orderId, pollIntervalMs]);

  async function handleQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) {
      setErrorMessage(t('pages.offramp.errors.session'));
      return;
    }

    setErrorMessage(null);
    setInfoMessage(null);
    setIsQuoting(true);

    try {
      const quoted = await fetchOfframpJson<OfframpQuoteResponse>(accessToken, '/api/offramp/orders/quote', {
        method: 'POST',
        body: JSON.stringify({
          amountUsdc,
          payoutPixKey,
          payoutBeneficiaryName: payoutBeneficiaryName.trim() || null,
        }),
      });

      setSummaryPanelOpen(true);
      setDepositPanelOpen(false);
      hadDepositRef.current = false;
      setOrder(orderFromQuote(quoted));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsQuoting(false);
    }
  }

  async function handleLockQuote() {
    if (!accessToken || !orderId) {
      setErrorMessage(t('pages.offramp.errors.session'));
      return;
    }
    if (isQuoteExpired) {
      setErrorMessage(t('pages.offramp.errors.quoteExpired'));
      return;
    }

    setErrorMessage(null);
    setInfoMessage(null);
    setIsLocking(true);

    try {
      const locked = await fetchOfframpJson<OfframpLockResponse>(
        accessToken,
        `/api/offramp/orders/${encodeURIComponent(orderId)}/lock`,
        { method: 'POST' },
      );
      setOrder((current) => mergeLockIntoOrder(current, locked));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLocking(false);
    }
  }

  async function handleRefreshStatus() {
    if (!orderId) return;
    setErrorMessage(null);
    setIsRefreshing(true);
    try {
      await loadOrder(orderId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleRetryReconciliation() {
    if (!accessToken || !orderId) {
      setErrorMessage(t('pages.offramp.errors.session'));
      return;
    }

    setErrorMessage(null);
    setInfoMessage(null);
    setIsRetrying(true);

    try {
      const result = await fetchOfframpJson<OfframpReconcileResponse>(
        accessToken,
        `/api/offramp/orders/${encodeURIComponent(orderId)}/reconcile`,
        { method: 'POST' },
      );
      setOrder(result.order);
      setInfoMessage(t('pages.offramp.reconcileSuccess'));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRetrying(false);
    }
  }

  async function handleCopy(field: 'address' | 'memo', value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
    } catch {
      setErrorMessage(t('pages.offramp.errors.copyFailed'));
    }
  }

  const hasActiveQuote = Boolean(order && order.status === 'quoted');

  const orderSummaryBody = order ? (
    <>
      <div className="onramp-summary-grid">
        <div className="onramp-summary-field">
          <span>{t('pages.offramp.summary.send')}</span>
          <strong>{`${formatUsdcAmount(order.quote.amountUsdc, localeCode)} USDC`}</strong>
        </div>
        <div className="onramp-summary-field">
          <span>{t('pages.offramp.summary.receive')}</span>
          <strong>{formatBrlAmount(order.quote.amountBrl, localeCode)}</strong>
        </div>
        <div className="onramp-summary-field">
          <span>{t('pages.offramp.summary.payoutKey')}</span>
          <strong>{order.payout.key}</strong>
        </div>
        <div className="onramp-summary-field">
          <span>{t('pages.offramp.summary.quoteExpiresAt')}</span>
          <strong>{formatDateTime(order.quote.expiresAt, localeCode)}</strong>
        </div>
      </div>

      <div className="onramp-meta-list">
        <p>
          <strong>{t('pages.offramp.summary.quoteCountdown')}</strong> {quoteCountdown ?? '—'}
        </p>
      </div>

      {isQuoteExpired ? (
        <p className="onramp-quote-expired-notice" role="status">
          {t('pages.offramp.summary.quoteExpiredNotice')}
        </p>
      ) : null}

      {isQuoteReady ? (
        <div className="onramp-summary-actions">
          <Button type="button" fullWidth onClick={handleLockQuote} disabled={isLocking}>
            {isLocking ? t('pages.offramp.lockLoading') : t('pages.offramp.lockAction')}
          </Button>
        </div>
      ) : null}
    </>
  ) : null;

  const summaryPanelBadge = order ? (
    <span className={`onramp-status-badge onramp-status-badge--${getStatusTone(order.status)}`}>
      {statusLabel}
    </span>
  ) : null;

  if (authLoading || profile?.role !== 'admin') {
    return (
      <section className="dashboard-layout">
        <article className="surface">
          <p className="surface__lead">{t('pages.settings.loading')}</p>
        </article>
      </section>
    );
  }

  return (
    <section className="onramp-layout">
      <div className={`onramp-grid${hasSideColumn ? ' onramp-grid--with-side' : ''}`}>
        <div className="onramp-main">
          <RampCollapsiblePanel
            className="onramp-form-card"
            eyebrow={t('pages.offramp.eyebrow')}
            title={t('pages.offramp.title')}
            subtitle={t('pages.offramp.description')}
          >
            {errorMessage ? (
              <p className="auth-inline-error onramp-alert" role="alert">
                {errorMessage}
              </p>
            ) : null}

            {infoMessage ? (
              <p className="form-success-message onramp-alert" role="status">
                {infoMessage}
              </p>
            ) : null}

            <form className="onramp-form" onSubmit={handleQuote}>
              <div className="onramp-form__fields">
                <InputField
                  id="offramp-amount-usdc"
                  label={t('pages.offramp.amountUsdc')}
                  type="text"
                  inputMode="decimal"
                  value={amountUsdc}
                  onChange={(event) => setAmountUsdc(event.target.value)}
                  placeholder={t('pages.offramp.amountUsdcPlaceholder')}
                  required
                  disabled={formFieldsLocked}
                />
                <InputField
                  id="offramp-pix-key"
                  label={t('pages.offramp.payoutPixKey')}
                  type="text"
                  value={payoutPixKey}
                  onChange={(event) => setPayoutPixKey(event.target.value)}
                  placeholder={t('pages.offramp.payoutPixKeyPlaceholder')}
                  required
                  disabled={formFieldsLocked}
                />
                <InputField
                  id="offramp-beneficiary"
                  label={t('pages.offramp.payoutBeneficiaryName')}
                  type="text"
                  value={payoutBeneficiaryName}
                  onChange={(event) => setPayoutBeneficiaryName(event.target.value)}
                  placeholder={t('pages.offramp.payoutBeneficiaryNamePlaceholder')}
                  disabled={formFieldsLocked}
                />
              </div>

              {showQuoteFormActions ? (
                <div className="onramp-inline-actions">
                  <Button
                    type="submit"
                    disabled={!amountUsdc.trim() || !payoutPixKey.trim() || isQuoting || isLocking}
                  >
                    {isQuoting
                      ? hasActiveQuote
                        ? t('pages.offramp.newQuoteLoading')
                        : t('pages.offramp.quoteLoading')
                      : hasActiveQuote
                        ? t('pages.offramp.newQuoteAction')
                        : t('pages.offramp.quoteAction')}
                  </Button>
                </div>
              ) : null}
            </form>
          </RampCollapsiblePanel>

          <RampCollapsiblePanel
            className="onramp-status-card"
            eyebrow={t('pages.offramp.statusCardEyebrow')}
            title={t('pages.offramp.statusCardTitle')}
            titleAs="h3"
            headerActions={
              <div className="onramp-inline-actions">
                {orderId ? (
                  <Button type="button" variant="secondary" onClick={handleRefreshStatus} disabled={isRefreshing}>
                    {isRefreshing ? t('pages.offramp.refreshLoading') : t('pages.offramp.refreshAction')}
                  </Button>
                ) : null}
                {canRetryReconciliation ? (
                  <Button type="button" variant="secondary" onClick={handleRetryReconciliation} disabled={isRetrying}>
                    {isRetrying ? t('pages.offramp.retryLoading') : t('pages.offramp.retryAction')}
                  </Button>
                ) : null}
              </div>
            }
          >
            <p className="onramp-status-card__description">{statusDescription}</p>

            {order ? (
              <>
                <ol className="onramp-step-list">
                  {timelineSteps.map((step) => (
                    <li key={step.label} className={`onramp-step onramp-step--${step.state}`}>
                      <span className="onramp-step__dot" aria-hidden="true" />
                      <span>{step.label}</span>
                    </li>
                  ))}
                </ol>

                <div className="onramp-timeline-grid">
                  <div className="onramp-summary-field">
                    <span>{t('pages.offramp.timeline.quotedAt')}</span>
                    <strong>{formatDateTime(order.timeline.quotedAt, localeCode)}</strong>
                  </div>
                  <div className="onramp-summary-field">
                    <span>{t('pages.offramp.timeline.usdcReceivedAt')}</span>
                    <strong>{formatDateTime(order.timeline.usdcReceivedAt, localeCode)}</strong>
                  </div>
                  <div className="onramp-summary-field">
                    <span>{t('pages.offramp.timeline.pixSentAt')}</span>
                    <strong>{formatDateTime(order.timeline.pixSentAt, localeCode)}</strong>
                  </div>
                </div>

                {order.deposit?.txHash ||
                order.payout.endToEndId ||
                order.timeline.pixSentAt ||
                order.failure?.reason ? (
                  <div className="onramp-reference-list">
                    {order.deposit?.txHash ? (
                      <p className="onramp-reference-list__hash">
                        <strong>{t('pages.offramp.references.depositTxHash')}</strong>{' '}
                        <CryptoTxHashLink txHash={order.deposit.txHash} />
                      </p>
                    ) : null}
                    {order.payout.endToEndId || order.timeline.pixSentAt ? (
                      <>
                        <p>
                          <strong>{t('pages.offramp.references.pixAmountSent')}</strong>{' '}
                          {formatBrlAmount(order.quote.amountBrl, localeCode)}
                        </p>
                        <p>
                          <strong>{t('pages.offramp.references.pixSentAt')}</strong>{' '}
                          {formatDateTime(order.timeline.pixSentAt, localeCode)}
                        </p>
                        {order.payout.endToEndId ? (
                          <p>
                            <strong>{t('pages.offramp.references.pixEndToEndId')}</strong>{' '}
                            <code>{order.payout.endToEndId}</code>
                          </p>
                        ) : null}
                      </>
                    ) : null}
                    {order.failure?.reason ? (
                      <p>
                        <strong>{t('pages.offramp.references.failureReason')}</strong> {order.failure.reason}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}
          </RampCollapsiblePanel>
        </div>

        {order ? (
          <div className="onramp-side">
            <RampCollapsiblePanel
              eyebrow={t('pages.offramp.quoteCardEyebrow')}
              title={t('pages.offramp.quoteCardTitle')}
              badge={summaryPanelBadge}
              open={summaryPanelOpen}
              onOpenChange={setSummaryPanelOpen}
            >
              {orderSummaryBody}
            </RampCollapsiblePanel>

            {deposit ? (
              <RampCollapsiblePanel
                eyebrow={t('pages.offramp.depositEyebrow')}
                title={t('pages.offramp.depositTitle')}
                open={depositPanelOpen}
                onOpenChange={setDepositPanelOpen}
              >
                <div className="onramp-summary-grid">
                  <div className="onramp-summary-field onramp-summary-field--full">
                    <span>{t('pages.offramp.depositAddress')}</span>
                    <strong>
                      <code>{deposit.address}</code>
                    </strong>
                  </div>
                  {deposit.memo ? (
                    <div className="onramp-summary-field onramp-summary-field--full">
                      <span>{t('pages.offramp.depositMemo')}</span>
                      <strong>
                        <code>{deposit.memo}</code>
                      </strong>
                    </div>
                  ) : null}
                  {deposit.expiresAt ? (
                    <div className="onramp-summary-field onramp-summary-field--full">
                      <span>{t('pages.offramp.depositExpiresAt')}</span>
                      <strong>{formatDateTime(deposit.expiresAt, localeCode)}</strong>
                    </div>
                  ) : null}
                </div>

                <div className="onramp-inline-actions">
                  <Button type="button" variant="secondary" onClick={() => handleCopy('address', deposit.address)}>
                    {copiedField === 'address' ? t('pages.offramp.copied') : t('pages.offramp.copyAddress')}
                  </Button>
                  {deposit.memo ? (
                    <Button type="button" variant="secondary" onClick={() => handleCopy('memo', deposit.memo!)}>
                      {copiedField === 'memo' ? t('pages.offramp.copied') : t('pages.offramp.copyMemo')}
                    </Button>
                  ) : null}
                </div>
              </RampCollapsiblePanel>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
