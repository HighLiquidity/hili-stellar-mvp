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

import { listOnrampWithdrawWhitelistAction } from '@/app/actions/withdraw-whitelist';
import { CryptoTxHashLink } from '@/components/ledger/CryptoTxHashLink';
import { RampCollapsiblePanel } from '@/components/RampCollapsiblePanel';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import { useAuth } from '@/hooks/useAuth';
import { useUsdcRampAccess } from '@/hooks/useRampAvailability';
import { useI18n } from '@/lib/i18n';
import { isOnrampQuotePlaceholderDestination } from '@/lib/ramp/quote-placeholders';
import type {
  OnrampLockResponse,
  OnrampOrderResponse,
  OnrampOrderStatus,
  OnrampQuoteResponse,
} from '@/lib/onramp/contracts';
import { calculateNetUsdcDeliveredToClient } from '@/lib/onramp/usdc-delivery-fee';
import type { WithdrawWhitelistRow } from '@/lib/withdraw-whitelist/types';

const CLOCK_TICK_INTERVAL_MS = 1_000;

const EMPTY_TIMELINE = {
  quotedAt: '',
  pixReceivedAt: null,
  brhSoldAt: null,
  usdcDeliveredAt: null,
  fxSettledAt: null,
  brhRedeemedAt: null,
  completeAt: null,
  expiredAt: null,
  refundedAt: null,
} as const;

const EMPTY_REFERENCES = {
  brhSaleExternalId: null,
  usdcDeliveryExternalId: null,
  binanceClientOrderId: null,
  binanceWithdrawOrderId: null,
  deliveryTxHash: null,
} as const;

type OnrampReconcileResponse = {
  ok: true;
  order: OnrampOrderResponse;
};

type TimelineStepState = 'completed' | 'current' | 'upcoming';
type StatusTone = 'neutral' | 'progress' | 'success' | 'warning' | 'danger';

function shouldPollOrder(status: OnrampOrderStatus) {
  if (status === 'quoted') {
    return false;
  }

  return status !== 'complete' && status !== 'failed' && status !== 'expired' && status !== 'refunded';
}

/** Polling only while the order can still change without user action. */
function getOrderPollIntervalMs(status: OnrampOrderStatus): number | null {
  if (!shouldPollOrder(status)) {
    return null;
  }

  switch (status) {
    case 'awaiting_pix':
      return 6_000;
    case 'pix_received':
      return 5_000;
    case 'usdc_delivered':
      return 20_000;
    case 'brh_sold':
    case 'fx_settled':
    case 'brh_redeemed':
    case 'needs_review':
      return 12_000;
    default:
      return 10_000;
  }
}

function orderFromQuote(quoted: OnrampQuoteResponse): OnrampOrderResponse {
  return {
    orderId: quoted.orderId,
    status: quoted.status,
    quote: quoted.quote,
    destination: quoted.destination,
    pix: null,
    timeline: { ...EMPTY_TIMELINE },
    references: { ...EMPTY_REFERENCES },
    failure: null,
  };
}

function mergeLockIntoOrder(
  previous: OnrampOrderResponse | null,
  locked: OnrampLockResponse,
): OnrampOrderResponse {
  const base =
    previous?.orderId === locked.orderId
      ? previous
      : {
          orderId: locked.orderId,
          status: 'quoted' as const,
          quote: locked.quote,
          destination: locked.destination,
          pix: null,
          timeline: { ...EMPTY_TIMELINE },
          references: { ...EMPTY_REFERENCES },
          failure: null,
        };

  return {
    ...base,
    orderId: locked.orderId,
    status: locked.status,
    quote: locked.quote,
    destination: locked.destination,
    pix: { ...locked.pix, paidAt: null },
  };
}

function shouldBlockInputs(status: OnrampOrderStatus) {
  return (
    status === 'quoted' ||
    status === 'awaiting_pix' ||
    status === 'pix_received' ||
    status === 'brh_sold' ||
    status === 'fx_settled' ||
    status === 'brh_redeemed' ||
    status === 'usdc_delivered' ||
    status === 'needs_review'
  );
}

function getStatusTone(status: OnrampOrderStatus): StatusTone {
  switch (status) {
    case 'complete':
    case 'usdc_delivered':
      return 'success';
    case 'needs_review':
    case 'expired':
      return 'warning';
    case 'failed':
    case 'refunded':
      return 'danger';
    case 'awaiting_pix':
    case 'pix_received':
    case 'brh_sold':
    case 'fx_settled':
    case 'brh_redeemed':
      return 'progress';
    default:
      return 'neutral';
  }
}

function getProgressIndex(order: OnrampOrderResponse) {
  switch (order.status) {
    case 'quoted':
      return 0;
    case 'awaiting_pix':
      return 1;
    case 'pix_received':
      return 2;
    case 'brh_sold':
    case 'fx_settled':
    case 'brh_redeemed':
      return 3;
    case 'usdc_delivered':
      return 4;
    case 'complete':
      return 5;
    default:
      if (order.timeline.usdcDeliveredAt) return 4;
      if (order.timeline.brhRedeemedAt || order.timeline.fxSettledAt || order.timeline.brhSoldAt) return 3;
      if (order.timeline.pixReceivedAt) return 2;
      if (order.pix) return 1;
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

async function fetchOnrampJson<T>(
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

type OnrampPageProps = {
  initialOrderId?: string | null;
};

export function OnrampPage({ initialOrderId }: OnrampPageProps = {}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { session, isLoading: authLoading, isAuthorized } = useAuth();
  const { canAccess: canAccessRamp } = useUsdcRampAccess();
  const localeCode = locale === 'pt' ? 'pt-BR' : 'en-US';
  const accessToken = session?.access_token ?? null;
  const openedFromOrderLink = Boolean(initialOrderId?.trim());

  const [taxId, setTaxId] = useState('');
  const [amountBrl, setAmountBrl] = useState('');
  const [amountUsdc, setAmountUsdc] = useState('');
  const [quoteAmountMode, setQuoteAmountMode] = useState<'brl' | 'usdc' | null>(null);
  const [destinationAddress, setDestinationAddress] = useState('');
  const [whitelistedWallets, setWhitelistedWallets] = useState<WithdrawWhitelistRow[]>([]);
  const [isLoadingWhitelistedWallets, setIsLoadingWhitelistedWallets] = useState(true);

  const [order, setOrder] = useState<OnrampOrderResponse | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isLocking, setIsLocking] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isPixCodeCopied, setIsPixCodeCopied] = useState(false);
  const [formPanelOpen, setFormPanelOpen] = useState(() => !openedFromOrderLink);
  const [trackingPanelOpen, setTrackingPanelOpen] = useState(true);
  const [summaryPanelOpen, setSummaryPanelOpen] = useState(true);
  const [pixPanelOpen, setPixPanelOpen] = useState(() => !openedFromOrderLink);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const hadPixRef = useRef(false);
  const quoteExpirySyncedRef = useRef(false);
  const loadedInitialOrderRef = useRef<string | null>(null);
  const viewOrderLayoutAppliedRef = useRef(false);

  const orderId = order?.orderId ?? null;
  const orderStatus = order?.status ?? null;
  const pix = order?.pix ?? null;
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
  const selectedWallet = useMemo(
    () => whitelistedWallets.find((wallet) => wallet.address === destinationAddress) ?? null,
    [destinationAddress, whitelistedWallets],
  );
  const hasWhitelistedWallets = whitelistedWallets.length > 0;
  const selectedWalletAllowed =
    !destinationAddress.trim() || whitelistedWallets.some((wallet) => wallet.address === destinationAddress);
  const canLockQuote =
    hasWhitelistedWallets &&
    Boolean(destinationAddress.trim()) &&
    selectedWalletAllowed;
  const canRetryReconciliation =
    Boolean(order?.timeline.usdcDeliveredAt) &&
    order?.status !== 'complete' &&
    order?.status !== 'failed' &&
    order?.status !== 'expired' &&
    order?.status !== 'refunded';
  const hasQuoteAmount = Boolean(amountBrl.trim() || amountUsdc.trim());
  const brlAmountDisabled = formFieldsLocked || quoteAmountMode === 'usdc';
  const usdcAmountDisabled = formFieldsLocked || quoteAmountMode === 'brl';

  function handleAmountBrlChange(value: string) {
    setAmountBrl(value);
    if (value.trim()) {
      setQuoteAmountMode('brl');
      setAmountUsdc('');
    } else if (quoteAmountMode === 'brl') {
      setQuoteAmountMode(null);
    }
  }

  function handleAmountUsdcChange(value: string) {
    setAmountUsdc(value);
    if (value.trim()) {
      setQuoteAmountMode('usdc');
      setAmountBrl('');
    } else if (quoteAmountMode === 'usdc') {
      setQuoteAmountMode(null);
    }
  }

  const quoteCountdown = order ? formatRemainingMs(order.quote.expiresAt, nowMs) : null;
  const paymentExpiresAt = order?.pix?.expiresAt ?? order?.quote.expiresAt ?? null;
  const paymentCountdown = paymentExpiresAt ? formatRemainingMs(paymentExpiresAt, nowMs) : null;
  const pixCountdown = order?.pix ? formatRemainingMs(order.pix.expiresAt, nowMs) : null;
  const isPaymentWindowExpired = Boolean(paymentExpiresAt && isQuoteExpiredAt(paymentExpiresAt, nowMs));

  const statusLabel = useMemo(() => {
    if (!order) return t('pages.onramp.status.idle');

    switch (order.status) {
      case 'quoted':
        return t('pages.onramp.status.quoted');
      case 'awaiting_pix':
        return t('pages.onramp.status.awaitingPix');
      case 'pix_received':
        return t('pages.onramp.status.pixReceived');
      case 'brh_sold':
      case 'fx_settled':
      case 'brh_redeemed':
        return t('pages.onramp.status.processing');
      case 'usdc_delivered':
        return t('pages.onramp.status.usdcDelivered');
      case 'complete':
        return t('pages.onramp.status.complete');
      case 'expired':
        return t('pages.onramp.status.expired');
      case 'failed':
        return t('pages.onramp.status.failed');
      case 'refunded':
        return t('pages.onramp.status.refunded');
      case 'needs_review':
        return t('pages.onramp.status.needsReview');
    }
  }, [order, t]);

  const statusDescription = useMemo(() => {
    if (!order) return t('pages.onramp.statusDescription.idle');

    switch (order.status) {
      case 'quoted':
        return t('pages.onramp.statusDescription.quoted');
      case 'awaiting_pix':
        return t('pages.onramp.statusDescription.awaitingPix');
      case 'pix_received':
        return t('pages.onramp.statusDescription.pixReceived');
      case 'brh_sold':
      case 'fx_settled':
      case 'brh_redeemed':
        return t('pages.onramp.statusDescription.processing');
      case 'usdc_delivered':
        return t('pages.onramp.statusDescription.usdcDelivered');
      case 'complete':
        return t('pages.onramp.statusDescription.complete');
      case 'expired':
        return t('pages.onramp.statusDescription.expired');
      case 'failed':
        return order.failure?.reason || t('pages.onramp.statusDescription.failed');
      case 'refunded':
        return t('pages.onramp.statusDescription.refunded');
      case 'needs_review':
        return order.failure?.needsReviewReason || order.failure?.reason || t('pages.onramp.statusDescription.needsReview');
    }
  }, [order, t]);

  const timelineSteps = useMemo(() => {
    if (!order) return [];

    const progressIndex = getProgressIndex(order);
    const labels = [
      t('pages.onramp.timeline.quote'),
      t('pages.onramp.timeline.pix'),
      t('pages.onramp.timeline.received'),
      t('pages.onramp.timeline.processing'),
      t('pages.onramp.timeline.delivered'),
      t('pages.onramp.timeline.complete'),
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
    if (!canAccessRamp) {
      router.replace('/app/dashboard');
    }
  }, [authLoading, canAccessRamp, isAuthorized, router]);

  useEffect(() => {
    if (!accessToken || authLoading || !canAccessRamp) return;
    const token = accessToken;

    let cancelled = false;
    async function loadWhitelistedWallets() {
      setIsLoadingWhitelistedWallets(true);
      try {
        const result = await listOnrampWithdrawWhitelistAction(token);
        if (cancelled) return;
        if (!result.ok) {
          setWhitelistedWallets([]);
          setErrorMessage((current) => current ?? result.message);
          return;
        }
        setWhitelistedWallets(result.data);
      } finally {
        if (!cancelled) setIsLoadingWhitelistedWallets(false);
      }
    }

    void loadWhitelistedWallets();
    return () => {
      cancelled = true;
    };
  }, [accessToken, authLoading, canAccessRamp]);

  useEffect(() => {
    if (!hasWhitelistedWallets) {
      if (!destinationAddress) return;
      setDestinationAddress('');
      return;
    }
    if (!destinationAddress || selectedWalletAllowed) return;
    setDestinationAddress(whitelistedWallets[0]?.address ?? '');
  }, [hasWhitelistedWallets, destinationAddress, selectedWalletAllowed, whitelistedWallets]);

  const loadOrder = useCallback(
    async (id: string) => {
      if (!accessToken) {
        throw new Error(t('pages.onramp.errors.session'));
      }

      const nextOrder = await fetchOnrampJson<OnrampOrderResponse>(
        accessToken,
        `/api/onramp/orders/${encodeURIComponent(id)}`,
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
    if (!order) return;

    const needsCountdown =
      Boolean(order.quote.expiresAt) ||
      order.status === 'quoted' ||
      order.status === 'awaiting_pix' ||
      Boolean(order.pix?.expiresAt);
    if (!needsCountdown) return;

    const timer = window.setInterval(() => setNowMs(Date.now()), CLOCK_TICK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [order]);

  useEffect(() => {
    setIsPixCodeCopied(false);
  }, [order?.pix?.copyPaste]);

  useEffect(() => {
    const hasPix = Boolean(pix);
    if (openedFromOrderLink) return;
    if (hasPix && !hadPixRef.current) {
      setSummaryPanelOpen(false);
      setPixPanelOpen(true);
    }
    if (!hasPix) {
      setSummaryPanelOpen(true);
    }
    hadPixRef.current = hasPix;
  }, [pix, openedFromOrderLink]);

  useEffect(() => {
    if (!openedFromOrderLink || !order || viewOrderLayoutAppliedRef.current) return;

    viewOrderLayoutAppliedRef.current = true;
    setFormPanelOpen(false);
    setTrackingPanelOpen(true);
    setSummaryPanelOpen(true);
    setPixPanelOpen(false);
  }, [openedFromOrderLink, order]);

  useEffect(() => {
    if (!order || order.status !== 'quoted') {
      quoteExpirySyncedRef.current = false;
      return;
    }

    if (!isQuoteExpiredAt(order.quote.expiresAt, nowMs)) {
      return;
    }

    if (quoteExpirySyncedRef.current || !orderId) {
      return;
    }

    quoteExpirySyncedRef.current = true;
    void loadOrder(orderId).catch(() => {
      quoteExpirySyncedRef.current = false;
    });
  }, [order, orderId, nowMs, loadOrder]);

  useEffect(() => {
    if (!orderId || !accessToken || pollIntervalMs == null) {
      return;
    }

    const activeOrderId = orderId;
    const token = accessToken;
    let cancelled = false;
    let inFlight = false;

    async function pollOrder() {
      if (cancelled || inFlight) {
        return;
      }

      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }

      inFlight = true;
      try {
        const nextOrder = await fetchOnrampJson<OnrampOrderResponse>(
          token,
          `/api/onramp/orders/${encodeURIComponent(activeOrderId)}`,
        );

        if (!cancelled) {
          setOrder((current) => {
            if (current?.status === nextOrder.status && current?.orderId === nextOrder.orderId) {
              const samePix =
                current.pix?.copyPaste === nextOrder.pix?.copyPaste &&
                current.pix?.txid === nextOrder.pix?.txid;
              if (
                samePix &&
                current.timeline.pixReceivedAt === nextOrder.timeline.pixReceivedAt &&
                current.timeline.usdcDeliveredAt === nextOrder.timeline.usdcDeliveredAt &&
                current.timeline.completeAt === nextOrder.timeline.completeAt &&
                current.references.deliveryTxHash === nextOrder.references.deliveryTxHash
              ) {
                return current;
              }
            }
            return nextOrder;
          });
        }
      } catch {
        /* polling is best-effort */
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
      setErrorMessage(t('pages.onramp.errors.session'));
      return;
    }

    setErrorMessage(null);
    setInfoMessage(null);
    setIsQuoting(true);

    try {
      const quoteBasis = quoteAmountMode ?? (amountUsdc.trim() ? 'usdc' : 'brl');
      const quoteBody =
        quoteBasis === 'usdc'
          ? {
              taxId,
              amountUsdc: amountUsdc.trim(),
              ...(destinationAddress.trim() ? { destinationAddress } : {}),
            }
          : {
              taxId,
              amountBrl: amountBrl.trim(),
              ...(destinationAddress.trim() ? { destinationAddress } : {}),
            };

      const quoted = await fetchOnrampJson<OnrampQuoteResponse>(accessToken, '/api/onramp/orders/quote', {
        method: 'POST',
        body: JSON.stringify(quoteBody),
      });

      setSummaryPanelOpen(true);
      setPixPanelOpen(false);
      hadPixRef.current = false;
      setOrder(orderFromQuote(quoted));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsQuoting(false);
    }
  }

  async function handleLockQuote() {
    if (!accessToken || !orderId) {
      setErrorMessage(t('pages.onramp.errors.session'));
      return;
    }

    if (isQuoteExpired) {
      setErrorMessage(t('pages.onramp.errors.quoteExpired'));
      return;
    }
    if (!canLockQuote) {
      setErrorMessage(t('pages.onramp.whitelistedWalletEmpty'));
      return;
    }

    setErrorMessage(null);
    setInfoMessage(null);
    setIsLocking(true);

    try {
      const locked = await fetchOnrampJson<OnrampLockResponse>(
        accessToken,
        `/api/onramp/orders/${encodeURIComponent(orderId)}/lock`,
        {
          method: 'POST',
          body: JSON.stringify({ destinationAddress }),
        },
      );

      setOrder((current) => mergeLockIntoOrder(current, locked));
      setInfoMessage(null);
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
      setErrorMessage(t('pages.onramp.errors.session'));
      return;
    }

    setErrorMessage(null);
    setInfoMessage(null);
    setIsRetrying(true);

    try {
      const result = await fetchOnrampJson<OnrampReconcileResponse>(
        accessToken,
        `/api/onramp/orders/${encodeURIComponent(orderId)}/reconcile`,
        {
          method: 'POST',
        },
      );

      setOrder(result.order);
      setInfoMessage(t('pages.onramp.reconcileSuccess'));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRetrying(false);
    }
  }

  async function handleCopyPixCode() {
    if (!order?.pix?.copyPaste) return;

    try {
      await navigator.clipboard.writeText(order.pix.copyPaste);
      setIsPixCodeCopied(true);
    } catch {
      setErrorMessage(t('pages.onramp.errors.copyFailed'));
    }
  }

  const netUsdcReceiveAmount = useMemo(() => {
    if (!order) return null;
    try {
      return calculateNetUsdcDeliveredToClient(order.quote.amountUsdc);
    } catch {
      return null;
    }
  }, [order]);

  const orderSummaryBody = order ? (
    <>
      <div className="onramp-summary-grid">
        <div className="onramp-summary-field">
          <span>{t('pages.onramp.summary.pay')}</span>
          <strong>{formatBrlAmount(order.quote.amountBrl, localeCode)}</strong>
        </div>
        <div className="onramp-summary-field onramp-summary-field--receive">
          <span>{t('pages.onramp.summary.receive')}</span>
          <strong>
            {netUsdcReceiveAmount
              ? `${formatUsdcAmount(netUsdcReceiveAmount, localeCode)} USDC`
              : `${formatUsdcAmount(order.quote.amountUsdc, localeCode)} USDC`}
          </strong>
          <p className="onramp-summary-field__fee-note">{t('pages.onramp.summary.receiveFeeNote')}</p>
        </div>
        <div className="onramp-summary-field onramp-summary-field--full">
          <span>{t('pages.onramp.summary.destination')}</span>
          <strong>
            {isOnrampQuotePlaceholderDestination(order.destination.address)
              ? t('pages.onramp.whitelistedWalletPlaceholder')
              : order.destination.address}
          </strong>
        </div>
        {order.destination.memo ? (
          <div className="onramp-summary-field onramp-summary-field--full">
            <span>{t('pages.onramp.destinationMemo')}</span>
            <strong>
              <code>{order.destination.memo}</code>
            </strong>
          </div>
        ) : null}
        <div className="onramp-summary-field">
          <span>
            {order.pix
              ? t('pages.onramp.summary.paymentExpiresAt')
              : t('pages.onramp.summary.quoteExpiresAt')}
          </span>
          <strong>
            {formatDateTime(order.pix?.expiresAt ?? order.quote.expiresAt, localeCode)}
          </strong>
        </div>
      </div>

      <div className="onramp-meta-list">
        <p>
          <strong>
            {order.pix
              ? t('pages.onramp.summary.paymentCountdown')
              : t('pages.onramp.summary.quoteCountdown')}
          </strong>{' '}
          {(order.pix ? paymentCountdown : quoteCountdown) ?? '—'}
        </p>
      </div>

      {isQuoteExpired || (order.pix && isPaymentWindowExpired && order.status === 'awaiting_pix') ? (
        <p className="onramp-quote-expired-notice" role="status">
          {t('pages.onramp.summary.quoteExpiredNotice')}
        </p>
      ) : null}

      {isQuoteReady ? (
        <div className="onramp-summary-actions">
          {!canLockQuote ? (
            <p className="onramp-alert" role="status">
              {t('pages.onramp.whitelistedWalletEmpty')}
            </p>
          ) : null}
          <Button type="button" fullWidth onClick={handleLockQuote} disabled={isLocking || !canLockQuote}>
            {isLocking ? t('pages.onramp.lockLoading') : t('pages.onramp.lockAction')}
          </Button>
        </div>
      ) : null}
    </>
  ) : null;

  const hasActiveQuote = Boolean(order && order.status === 'quoted');

  const summaryPanelBadge = useMemo(() => {
    if (!order) return null;

    const statusBadge = (
      <span className={`onramp-status-badge onramp-status-badge--${getStatusTone(order.status)}`}>
        {statusLabel}
      </span>
    );

    const showQuoteCountdown =
      !summaryPanelOpen && (order.status === 'quoted' || order.status === 'awaiting_pix');

    if (!showQuoteCountdown) {
      return statusBadge;
    }

    const timerExpiresAt = order.pix?.expiresAt ?? order.quote.expiresAt;
    const timerExpired =
      order.status === 'expired' || isQuoteExpiredAt(timerExpiresAt, nowMs);
    const timerDisplay =
      order.pix && order.status !== 'quoted' ? paymentCountdown : quoteCountdown;

    if (timerExpired) {
      return (
        <span className="onramp-status-badge onramp-status-badge--warning">
          {t('pages.onramp.status.expired')}
        </span>
      );
    }

    return (
      <span className="onramp-quote-timer-badge" aria-live="polite">
        <span className="onramp-quote-timer-badge__icon" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </span>
        <span>{timerDisplay ?? '—'}</span>
      </span>
    );
  }, [order, summaryPanelOpen, nowMs, paymentCountdown, quoteCountdown, statusLabel, t]);

  if (authLoading || !canAccessRamp) {
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
            eyebrow={t('pages.onramp.eyebrow')}
            title={t('pages.onramp.title')}
            subtitle={t('pages.onramp.description')}
            open={formPanelOpen}
            onOpenChange={setFormPanelOpen}
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
                  id="onramp-tax-id"
                  label={t('pages.onramp.taxId')}
                  type="text"
                  value={taxId}
                  onChange={(event) => setTaxId(event.target.value)}
                  placeholder={t('pages.onramp.taxIdPlaceholder')}
                  autoComplete="off"
                  required
                  disabled={formFieldsLocked}
                />
                <div className="onramp-form__amount-row">
                  <InputField
                    id="onramp-amount-brl"
                    label={t('pages.onramp.amountBrl')}
                    type="text"
                    inputMode="decimal"
                    value={amountBrl}
                    onChange={(event) => handleAmountBrlChange(event.target.value)}
                    placeholder={t('pages.onramp.amountBrlPlaceholder')}
                    disabled={brlAmountDisabled}
                  />
                  <InputField
                    id="onramp-amount-usdc"
                    label={t('pages.onramp.amountUsdc')}
                    type="text"
                    inputMode="decimal"
                    value={amountUsdc}
                    onChange={(event) => handleAmountUsdcChange(event.target.value)}
                    placeholder={t('pages.onramp.amountUsdcPlaceholder')}
                    disabled={usdcAmountDisabled}
                  />
                </div>
                <label className="field">
                  <span className="field__label">{t('pages.onramp.whitelistedWallet')}</span>
                  <select
                    className="field__input field__select"
                    value={destinationAddress}
                    onChange={(event) => setDestinationAddress(event.target.value)}
                    disabled={formFieldsLocked || isLoadingWhitelistedWallets}
                  >
                    <option value="">
                      {isLoadingWhitelistedWallets
                        ? t('pages.onramp.whitelistedWalletLoading')
                        : t('pages.onramp.whitelistedWalletPlaceholder')}
                    </option>
                    {whitelistedWallets.map((wallet) => (
                      <option key={wallet.id} value={wallet.address}>
                        {wallet.label?.trim()
                          ? `${wallet.label} - ${wallet.address}`
                          : wallet.address}
                        {wallet.memo ? ` (${wallet.memo})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedWallet?.memo ? (
                  <p className="onramp-form__wallet-meta" role="status">
                    {t('pages.onramp.whitelistedWalletMemo')}: <code>{selectedWallet.memo}</code>
                  </p>
                ) : null}
                {!isLoadingWhitelistedWallets && !hasWhitelistedWallets ? (
                  <p className="onramp-alert" role="status">
                    {t('pages.onramp.whitelistedWalletEmpty')}
                  </p>
                ) : null}
              </div>

              {showQuoteFormActions ? (
                <div className="onramp-inline-actions">
                  <Button
                    type="submit"
                    disabled={
                      !taxId.trim() ||
                      !hasQuoteAmount ||
                      isQuoting ||
                      isLocking
                    }
                  >
                    {isQuoting
                      ? hasActiveQuote
                        ? t('pages.onramp.newQuoteLoading')
                        : t('pages.onramp.quoteLoading')
                      : hasActiveQuote
                        ? t('pages.onramp.newQuoteAction')
                        : t('pages.onramp.quoteAction')}
                  </Button>
                </div>
              ) : null}
            </form>
          </RampCollapsiblePanel>

          <RampCollapsiblePanel
            className="onramp-status-card"
            eyebrow={t('pages.onramp.statusCardEyebrow')}
            title={t('pages.onramp.statusCardTitle')}
            titleAs="h3"
            open={trackingPanelOpen}
            onOpenChange={setTrackingPanelOpen}
            headerActions={
              <div className="onramp-inline-actions">
                {orderId ? (
                  <Button type="button" variant="secondary" onClick={handleRefreshStatus} disabled={isRefreshing}>
                    {isRefreshing ? t('pages.onramp.refreshLoading') : t('pages.onramp.refreshAction')}
                  </Button>
                ) : null}
                {canRetryReconciliation ? (
                  <Button type="button" variant="secondary" onClick={handleRetryReconciliation} disabled={isRetrying}>
                    {isRetrying ? t('pages.onramp.retryLoading') : t('pages.onramp.retryAction')}
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
                    <span>{t('pages.onramp.timeline.quotedAt')}</span>
                    <strong>{formatDateTime(order.timeline.quotedAt, localeCode)}</strong>
                  </div>
                  <div className="onramp-summary-field">
                    <span>{t('pages.onramp.timeline.pixReceivedAt')}</span>
                    <strong>{formatDateTime(order.timeline.pixReceivedAt, localeCode)}</strong>
                  </div>
                  <div className="onramp-summary-field">
                    <span>{t('pages.onramp.timeline.usdcDeliveredAt')}</span>
                    <strong>{formatDateTime(order.timeline.usdcDeliveredAt, localeCode)}</strong>
                  </div>
                </div>

                {order.references.deliveryTxHash ||
                order.timeline.usdcDeliveredAt ||
                order.failure?.reason ? (
                  <div className="onramp-reference-list">
                    {order.timeline.usdcDeliveredAt && netUsdcReceiveAmount ? (
                      <p>
                        <strong>{t('pages.onramp.references.usdcDeliveredAmount')}</strong>{' '}
                        {formatUsdcAmount(netUsdcReceiveAmount, localeCode)} USDC
                      </p>
                    ) : null}
                    {order.references.deliveryTxHash ? (
                      <p className="onramp-reference-list__hash">
                        <strong>{t('pages.onramp.references.deliveryTxHash')}</strong>{' '}
                        <CryptoTxHashLink txHash={order.references.deliveryTxHash} />
                      </p>
                    ) : null}
                    {order.failure?.reason ? (
                      <p>
                        <strong>{t('pages.onramp.references.failureReason')}</strong> {order.failure.reason}
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
              eyebrow={t('pages.onramp.quoteCardEyebrow')}
              title={t('pages.onramp.quoteCardTitle')}
              badge={summaryPanelBadge}
              open={summaryPanelOpen}
              onOpenChange={setSummaryPanelOpen}
            >
              {orderSummaryBody}
            </RampCollapsiblePanel>

            {pix ? (
              <RampCollapsiblePanel
                eyebrow={t('pages.onramp.pixEyebrow')}
                title={t('pages.onramp.pixTitle')}
                open={pixPanelOpen}
                onOpenChange={setPixPanelOpen}
              >
                <div
                  className="deposit-qr-placeholder deposit-qr-placeholder--filled"
                  aria-label={t('pages.onramp.pixQrTitle')}
                >
                  {/* Data URL generated server-side */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pix.qrDataUrl}
                    alt={t('pages.onramp.pixQrTitle')}
                    width={280}
                    height={280}
                    className="deposit-qr-image"
                  />
                </div>

                <div className="onramp-summary-grid">
                  <div className="onramp-summary-field">
                    <span>{t('pages.onramp.summary.pay')}</span>
                    <strong>{formatBrlAmount(order.quote.amountBrl, localeCode)}</strong>
                  </div>
                  <div className="onramp-summary-field">
                    <span>{t('pages.onramp.pixExpiresAt')}</span>
                    <strong>{formatDateTime(pix.expiresAt, localeCode)}</strong>
                  </div>
                </div>

                <p className="onramp-meta-list onramp-meta-list--single">
                  <strong>{t('pages.onramp.pixCountdown')}</strong> {pixCountdown ?? '—'}
                </p>

                <div
                  className="deposit-copy-placeholder deposit-copy-placeholder--filled"
                  aria-label={t('pages.onramp.pixCopyPasteTitle')}
                >
                  <span className="deposit-copy-code">{pix.copyPaste}</span>
                </div>

                <Button type="button" variant="secondary" fullWidth onClick={handleCopyPixCode}>
                  {isPixCodeCopied
                    ? t('pages.onramp.pixCopyPasteCopied')
                    : t('pages.onramp.pixCopyPasteButton')}
                </Button>
              </RampCollapsiblePanel>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
