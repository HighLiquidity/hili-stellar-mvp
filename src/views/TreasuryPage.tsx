'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';

import { CloseIcon, ExternalLinkIcon, RefreshIcon } from '@/components/Icons';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useI18n } from '@/lib/i18n';
import { buildStellarExpertAccountUrl } from '@/lib/stellar/explorer-url';
import type {
  TreasuryBrlReceivePlan,
  TreasuryBrlTransferPlan,
  TreasuryRefillAsset,
  TreasuryRefillPlan,
} from '@/lib/treasury/run-types';
import { treasuryAssetFromKind } from '@/lib/treasury/run-types';
import type {
  TreasuryOverviewResponse,
  TreasuryPocketId,
  TreasuryPocketRefreshResponse,
} from '@/lib/treasury/types';

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

function formatBrl(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPlanAmount(value: string, unit: string): string {
  return unit === 'BRL' ? formatBrl(value) : formatAmount(value, 7);
}

type PlanAfterRow = {
  label: string;
  current: string;
  after: string;
  unit: string;
  hint?: string;
};

function PlanAfterBalances({
  title,
  unavailableLabel,
  rows,
}: {
  title: string;
  unavailableLabel: string;
  rows: PlanAfterRow[];
}) {
  return (
    <>
      <p className="treasury-refill-plan__after-title">{title}</p>
      <ul className="treasury-refill-plan__list">
        {rows.map((row) => {
          const unavailable = row.current === 'unavailable' || row.after === 'unavailable';
          return (
            <li key={row.label}>
              {row.label}:{' '}
              <strong>
                {unavailable
                  ? row.hint ?? unavailableLabel
                  : `${formatPlanAmount(row.current, row.unit)} → ${formatPlanAmount(row.after, row.unit)} ${row.unit}`}
              </strong>
            </li>
          );
        })}
      </ul>
    </>
  );
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

type PocketRefreshButtonProps = {
  pocket: TreasuryPocketId;
  busy: boolean;
  disabled?: boolean;
  onRefresh: (pocket: TreasuryPocketId) => void;
  label: string;
};

function PocketRefreshButton({
  pocket,
  busy,
  disabled,
  onRefresh,
  label,
}: PocketRefreshButtonProps) {
  return (
    <button
      type="button"
      className={`treasury-refresh treasury-refresh--pocket${busy ? ' is-busy' : ''}`}
      disabled={disabled || busy}
      onClick={() => onRefresh(pocket)}
      aria-label={label}
      title={label}
    >
      <RefreshIcon width={14} height={14} aria-hidden="true" />
    </button>
  );
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

type RefillModalProps = {
  open: boolean;
  onClose: () => void;
  suggestedFree: { USDC: string | null; XLM: string | null };
  onExecuted: () => Promise<void>;
  busy: boolean;
};

function RefillModal({ open, onClose, suggestedFree, onExecuted, busy }: RefillModalProps) {
  const { t } = useI18n();
  const titleId = useId();
  const [asset, setAsset] = useState<TreasuryRefillAsset>('USDC');
  const [refillAmount, setRefillAmount] = useState('');
  const [refillPlan, setRefillPlan] = useState<TreasuryRefillPlan | null>(null);
  const [refillError, setRefillError] = useState<string | null>(null);
  const [refillMessage, setRefillMessage] = useState<string | null>(null);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const resetState = useCallback(() => {
    setAsset('USDC');
    setRefillAmount('');
    setRefillPlan(null);
    setRefillError(null);
    setRefillMessage(null);
    setIsDryRunning(false);
    setIsExecuting(false);
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isDryRunning && !isExecuting) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, resetState, isDryRunning, isExecuting]);

  const postRefill = useCallback(
    async (dryRun: boolean) => {
      setRefillError(null);
      setRefillMessage(null);
      if (dryRun) {
        setIsDryRunning(true);
      } else {
        setIsExecuting(true);
      }

      try {
        const token = await getAccessToken();
        if (!token) {
          setRefillError(t('pages.treasury.errors.session'));
          return;
        }

        const amount = refillAmount.trim();
        const response = await fetch('/api/treasury/runs', {
          method: 'POST',
          cache: 'no-store',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            dryRun,
            asset,
            ...(amount
              ? { amount }
              : dryRun
                ? {}
                : { amount: refillPlan?.amount }),
          }),
        });

        const body = (await response.json().catch(() => null)) as
          | { error?: string; plan?: TreasuryRefillPlan; run?: { id: string; status: string } }
          | null;

        if (!response.ok) {
          setRefillError(body?.error?.trim() || t('pages.treasury.refill.errors.failed'));
          return;
        }

        if (body?.plan) {
          setRefillPlan(body.plan);
          if (!amount) {
            setRefillAmount(body.plan.amount);
          }
        }

        if (dryRun) {
          setRefillMessage(t('pages.treasury.refill.dryRunSuccess'));
        } else {
          setRefillMessage(t('pages.treasury.refill.executeSuccess'));
          setRefillPlan(null);
          await onExecuted();
        }
      } catch {
        setRefillError(t('pages.treasury.refill.errors.failed'));
      } finally {
        setIsDryRunning(false);
        setIsExecuting(false);
      }
    },
    [asset, onExecuted, refillAmount, refillPlan?.amount, t],
  );

  if (!open) return null;

  const freeHint = suggestedFree[asset];
  const actionsDisabled = isDryRunning || isExecuting || busy;

  return (
    <div
      className="treasury-modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !actionsDisabled) onClose();
      }}
    >
      <div
        className="treasury-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="treasury-modal__header">
          <div className="treasury-modal__heading">
            <h2 id={titleId} className="treasury-modal__title">
              {t('pages.treasury.refill.title')}
            </h2>
            <p className="surface__lead treasury-modal__lead">
              {t('pages.treasury.refill.description')}
            </p>
          </div>
          <button
            type="button"
            className="treasury-modal__close"
            onClick={onClose}
            disabled={actionsDisabled}
            aria-label={t('pages.treasury.refill.close')}
            title={t('pages.treasury.refill.close')}
          >
            <CloseIcon width={16} height={16} aria-hidden="true" />
          </button>
        </header>

        <div className="treasury-modal__body">
          <div className="treasury-refill-asset" role="group" aria-label={t('pages.treasury.refill.assetLabel')}>
            {(['USDC', 'XLM'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`treasury-refill-asset__option${asset === option ? ' is-active' : ''}`}
                disabled={actionsDisabled}
                onClick={() => {
                  setAsset(option);
                  setRefillPlan(null);
                  setRefillMessage(null);
                  setRefillError(null);
                  setRefillAmount('');
                }}
              >
                {option}
              </button>
            ))}
          </div>

          <InputField
            id="treasury-refill-amount"
            label={`${t('pages.treasury.refill.amountLabel')} (${asset})`}
            value={refillAmount}
            onChange={(event) => {
              setRefillAmount(event.target.value);
              setRefillPlan(null);
              setRefillMessage(null);
            }}
            placeholder={
              freeHint
                ? `${t('pages.treasury.refill.amountPlaceholder')} (${freeHint})`
                : t('pages.treasury.refill.amountPlaceholder')
            }
            inputMode="decimal"
          />

          <div className="treasury-modal__actions">
            <Button
              type="button"
              variant="secondary"
              disabled={actionsDisabled}
              onClick={() => void postRefill(true)}
            >
              {isDryRunning ? t('pages.treasury.refill.dryRunning') : t('pages.treasury.refill.dryRun')}
            </Button>
            <Button
              type="button"
              disabled={
                actionsDisabled || !refillPlan || !refillAmount.trim() || refillPlan.asset !== asset
              }
              onClick={() => void postRefill(false)}
            >
              {isExecuting
                ? t('pages.treasury.refill.executing')
                : t('pages.treasury.refill.execute')}
            </Button>
          </div>

          {refillError ? (
            <p className="auth-inline-error" role="alert">
              {refillError}
            </p>
          ) : null}
          {refillMessage ? (
            <p className="form-success-message" role="status">
              {refillMessage}
            </p>
          ) : null}

          {refillPlan ? (
            <div className="treasury-refill-plan">
              <p className="treasury-refill-plan__title">{t('pages.treasury.refill.planTitle')}</p>
              <ul className="treasury-refill-plan__list">
                <li>
                  {t('pages.treasury.refill.planAmount')}:{' '}
                  <strong>
                    {formatAmount(refillPlan.amount, 4)} {refillPlan.asset}
                  </strong>
                </li>
                <li>
                  {t('pages.treasury.refill.planMin')}:{' '}
                  {formatAmount(refillPlan.minWithdraw, 4)} {refillPlan.asset}
                </li>
                <li>
                  {t('pages.treasury.refill.planNetwork')}: {refillPlan.distributor.network}
                  {refillPlan.distributor.addressTag
                    ? ` · memo ${refillPlan.distributor.addressTag}`
                    : ''}
                </li>
              </ul>
              <p className="treasury-refill-plan__note">
                {t('pages.treasury.refill.planAfterNote')}
              </p>
              <PlanAfterBalances
                title={t('pages.treasury.refill.planAfterTitle')}
                unavailableLabel={t('pages.treasury.refill.planAfterUnavailable')}
                rows={[
                  {
                    label: t('pages.treasury.refill.planAfterBinance'),
                    current: refillPlan.binanceFree,
                    after: refillPlan.binanceAfter,
                    unit: refillPlan.asset,
                  },
                  {
                    label: t('pages.treasury.refill.planAfterDistributor'),
                    current: refillPlan.distributorBalance,
                    after: refillPlan.distributorAfter,
                    unit: refillPlan.asset,
                    hint:
                      refillPlan.distributorBalance === 'unavailable' ||
                      refillPlan.distributorAfter === 'unavailable'
                        ? `${t('pages.treasury.refill.planAfterUnavailable')} (+${formatAmount(refillPlan.amount, 4)} ${refillPlan.asset})`
                        : undefined,
                  },
                ]}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type BrlTransferModalProps = {
  open: boolean;
  onClose: () => void;
  suggestedAvailable: string | null;
  onExecuted: () => Promise<void>;
  busy: boolean;
};

function BrlTransferModal({
  open,
  onClose,
  suggestedAvailable,
  onExecuted,
  busy,
}: BrlTransferModalProps) {
  const { t } = useI18n();
  const titleId = useId();
  const [amount, setAmount] = useState('');
  const [plan, setPlan] = useState<TreasuryBrlTransferPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const resetState = useCallback(() => {
    setAmount('');
    setPlan(null);
    setError(null);
    setMessage(null);
    setIsDryRunning(false);
    setIsExecuting(false);
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isDryRunning && !isExecuting) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, resetState, isDryRunning, isExecuting]);

  const postTransfer = useCallback(
    async (dryRun: boolean) => {
      setError(null);
      setMessage(null);
      if (dryRun) {
        setIsDryRunning(true);
      } else {
        setIsExecuting(true);
      }

      try {
        const token = await getAccessToken();
        if (!token) {
          setError(t('pages.treasury.errors.session'));
          return;
        }

        const trimmed = amount.trim();
        const response = await fetch('/api/treasury/runs', {
          method: 'POST',
          cache: 'no-store',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            dryRun,
            kind: 'corpx_brl_to_binance',
            ...(trimmed
              ? { amountBrl: trimmed }
              : dryRun
                ? {}
                : { amountBrl: plan?.amountBrl }),
          }),
        });

        const body = (await response.json().catch(() => null)) as
          | {
              error?: string;
              plan?: TreasuryBrlTransferPlan;
              run?: { id: string; status: string };
              binanceOrder?: { settled?: boolean; pixInFlight?: boolean };
            }
          | null;

        if (!response.ok) {
          setError(body?.error?.trim() || t('pages.treasury.brlTransfer.errors.failed'));
          return;
        }

        if (body?.plan) {
          setPlan(body.plan);
          if (!trimmed) {
            setAmount(body.plan.amountBrl);
          }
        }

        if (dryRun) {
          setMessage(t('pages.treasury.brlTransfer.dryRunSuccess'));
        } else {
          setMessage(
            body?.binanceOrder?.settled
              ? t('pages.treasury.brlTransfer.executeSuccess')
              : body?.binanceOrder?.pixInFlight
                ? t('pages.treasury.brlTransfer.executeSuccessInFlight')
                : t('pages.treasury.brlTransfer.executeSuccessPending'),
          );
          setPlan(null);
          await onExecuted();
        }
      } catch {
        setError(t('pages.treasury.brlTransfer.errors.failed'));
      } finally {
        setIsDryRunning(false);
        setIsExecuting(false);
      }
    },
    [amount, onExecuted, plan?.amountBrl, t],
  );

  if (!open) return null;

  const actionsDisabled = isDryRunning || isExecuting || busy;

  return (
    <div
      className="treasury-modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !actionsDisabled) onClose();
      }}
    >
      <div
        className="treasury-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="treasury-modal__header">
          <div className="treasury-modal__heading">
            <h2 id={titleId} className="treasury-modal__title">
              {t('pages.treasury.brlTransfer.title')}
            </h2>
            <p className="surface__lead treasury-modal__lead">
              {t('pages.treasury.brlTransfer.description')}
            </p>
          </div>
          <button
            type="button"
            className="treasury-modal__close"
            onClick={onClose}
            disabled={actionsDisabled}
            aria-label={t('pages.treasury.brlTransfer.close')}
            title={t('pages.treasury.brlTransfer.close')}
          >
            <CloseIcon width={16} height={16} aria-hidden="true" />
          </button>
        </header>

        <div className="treasury-modal__body">
          <InputField
            id="treasury-brl-transfer-amount"
            label={t('pages.treasury.brlTransfer.amountLabel')}
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setPlan(null);
              setMessage(null);
            }}
            placeholder={
              suggestedAvailable
                ? `${t('pages.treasury.brlTransfer.amountPlaceholder')} (${suggestedAvailable})`
                : t('pages.treasury.brlTransfer.amountPlaceholder')
            }
            inputMode="decimal"
          />

          <div className="treasury-modal__actions">
            <Button
              type="button"
              variant="secondary"
              disabled={actionsDisabled}
              onClick={() => void postTransfer(true)}
            >
              {isDryRunning
                ? t('pages.treasury.brlTransfer.dryRunning')
                : t('pages.treasury.brlTransfer.dryRun')}
            </Button>
            <Button
              type="button"
              disabled={actionsDisabled || !plan || !amount.trim()}
              onClick={() => void postTransfer(false)}
            >
              {isExecuting
                ? t('pages.treasury.brlTransfer.executing')
                : t('pages.treasury.brlTransfer.execute')}
            </Button>
          </div>

          {error ? (
            <p className="auth-inline-error" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="form-success-message" role="status">
              {message}
            </p>
          ) : null}

          {plan ? (
            <div className="treasury-refill-plan">
              <p className="treasury-refill-plan__title">
                {t('pages.treasury.brlTransfer.planTitle')}
              </p>
              <ul className="treasury-refill-plan__list">
                <li>
                  {t('pages.treasury.brlTransfer.planAmount')}:{' '}
                  <strong>{formatBrl(plan.amountBrl)} BRL</strong>
                </li>
                <li>
                  {t('pages.treasury.brlTransfer.planPayment')}:{' '}
                  {t('pages.treasury.brlTransfer.planPaymentValue')}
                </li>
              </ul>
              <PlanAfterBalances
                title={t('pages.treasury.brlTransfer.planAfterTitle')}
                unavailableLabel={t('pages.treasury.brlTransfer.planAfterUnavailable')}
                rows={[
                  {
                    label: t('pages.treasury.brlTransfer.planAfterCorpx'),
                    current: plan.corpxAvailable,
                    after: plan.corpxBrlAfter,
                    unit: 'BRL',
                  },
                  {
                    label: t('pages.treasury.brlTransfer.planAfterBinance'),
                    current: plan.binanceBrlFree,
                    after: plan.binanceBrlAfter,
                    unit: 'BRL',
                    hint:
                      plan.binanceBrlFree === 'unavailable' || plan.binanceBrlAfter === 'unavailable'
                        ? `${t('pages.treasury.brlTransfer.planAfterUnavailable')} (+${formatBrl(plan.amountBrl)} BRL)`
                        : undefined,
                  },
                ]}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type BrlReceiveModalProps = {
  open: boolean;
  onClose: () => void;
  suggestedFree: string | null;
  onExecuted: () => Promise<void>;
  busy: boolean;
};

function BrlReceiveModal({
  open,
  onClose,
  suggestedFree,
  onExecuted,
  busy,
}: BrlReceiveModalProps) {
  const { t } = useI18n();
  const titleId = useId();
  const [amount, setAmount] = useState('');
  const [plan, setPlan] = useState<TreasuryBrlReceivePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const resetState = useCallback(() => {
    setAmount('');
    setPlan(null);
    setError(null);
    setMessage(null);
    setIsDryRunning(false);
    setIsExecuting(false);
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isDryRunning && !isExecuting) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, resetState, isDryRunning, isExecuting]);

  const postReceive = useCallback(
    async (dryRun: boolean) => {
      setError(null);
      setMessage(null);
      if (dryRun) {
        setIsDryRunning(true);
      } else {
        setIsExecuting(true);
      }

      try {
        const token = await getAccessToken();
        if (!token) {
          setError(t('pages.treasury.errors.session'));
          return;
        }

        const trimmed = amount.trim();
        const response = await fetch('/api/treasury/runs', {
          method: 'POST',
          cache: 'no-store',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            dryRun,
            kind: 'binance_brl_to_corpx',
            ...(trimmed
              ? { amountBrl: trimmed }
              : dryRun
                ? {}
                : { amountBrl: plan?.amountBrl }),
          }),
        });

        const body = (await response.json().catch(() => null)) as
          | {
              error?: string;
              plan?: TreasuryBrlReceivePlan;
              run?: { id: string; status: string };
              binanceOrder?: { settled?: boolean };
            }
          | null;

        if (!response.ok) {
          setError(body?.error?.trim() || t('pages.treasury.brlReceive.errors.failed'));
          return;
        }

        if (body?.plan) {
          setPlan(body.plan);
          if (!trimmed) {
            setAmount(body.plan.amountBrl);
          }
        }

        if (dryRun) {
          setMessage(t('pages.treasury.brlReceive.dryRunSuccess'));
        } else {
          setMessage(
            body?.binanceOrder?.settled
              ? t('pages.treasury.brlReceive.executeSuccess')
              : t('pages.treasury.brlReceive.executeSuccessPending'),
          );
          setPlan(null);
          await onExecuted();
        }
      } catch {
        setError(t('pages.treasury.brlReceive.errors.failed'));
      } finally {
        setIsDryRunning(false);
        setIsExecuting(false);
      }
    },
    [amount, onExecuted, plan?.amountBrl, t],
  );

  if (!open) return null;

  const actionsDisabled = isDryRunning || isExecuting || busy;

  return (
    <div
      className="treasury-modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !actionsDisabled) onClose();
      }}
    >
      <div
        className="treasury-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="treasury-modal__header">
          <div className="treasury-modal__heading">
            <h2 id={titleId} className="treasury-modal__title">
              {t('pages.treasury.brlReceive.title')}
            </h2>
            <p className="surface__lead treasury-modal__lead">
              {t('pages.treasury.brlReceive.description')}
            </p>
          </div>
          <button
            type="button"
            className="treasury-modal__close"
            onClick={onClose}
            disabled={actionsDisabled}
            aria-label={t('pages.treasury.brlReceive.close')}
            title={t('pages.treasury.brlReceive.close')}
          >
            <CloseIcon width={16} height={16} aria-hidden="true" />
          </button>
        </header>

        <div className="treasury-modal__body">
          <InputField
            id="treasury-brl-receive-amount"
            label={t('pages.treasury.brlReceive.amountLabel')}
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setPlan(null);
              setMessage(null);
            }}
            placeholder={
              suggestedFree
                ? `${t('pages.treasury.brlReceive.amountPlaceholder')} (${suggestedFree})`
                : t('pages.treasury.brlReceive.amountPlaceholder')
            }
            inputMode="decimal"
          />

          <div className="treasury-modal__actions">
            <Button
              type="button"
              variant="secondary"
              disabled={actionsDisabled}
              onClick={() => void postReceive(true)}
            >
              {isDryRunning
                ? t('pages.treasury.brlReceive.dryRunning')
                : t('pages.treasury.brlReceive.dryRun')}
            </Button>
            <Button
              type="button"
              disabled={actionsDisabled || !plan || !amount.trim()}
              onClick={() => void postReceive(false)}
            >
              {isExecuting
                ? t('pages.treasury.brlReceive.executing')
                : t('pages.treasury.brlReceive.execute')}
            </Button>
          </div>

          {error ? (
            <p className="auth-inline-error" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="form-success-message" role="status">
              {message}
            </p>
          ) : null}

          {plan ? (
            <div className="treasury-refill-plan">
              <p className="treasury-refill-plan__title">
                {t('pages.treasury.brlReceive.planTitle')}
              </p>
              <ul className="treasury-refill-plan__list">
                <li>
                  {t('pages.treasury.brlReceive.planAmount')}:{' '}
                  <strong>{formatBrl(plan.amountBrl)} BRL</strong>
                </li>
                <li>
                  {t('pages.treasury.brlReceive.planDestination')}:{' '}
                  <code>{plan.destinationMasked}</code>
                </li>
                <li>
                  {t('pages.treasury.brlReceive.planPayment')}:{' '}
                  {t('pages.treasury.brlReceive.planPaymentValue')}
                </li>
              </ul>
              <PlanAfterBalances
                title={t('pages.treasury.brlReceive.planAfterTitle')}
                unavailableLabel={t('pages.treasury.brlReceive.planAfterUnavailable')}
                rows={[
                  {
                    label: t('pages.treasury.brlReceive.planAfterBinance'),
                    current: plan.binanceBrlFree,
                    after: plan.binanceBrlAfter,
                    unit: 'BRL',
                  },
                  {
                    label: t('pages.treasury.brlReceive.planAfterCorpx'),
                    current: plan.corpxAvailable,
                    after: plan.corpxBrlAfter,
                    unit: 'BRL',
                    hint:
                      plan.corpxAvailable === 'unavailable' || plan.corpxBrlAfter === 'unavailable'
                        ? `${t('pages.treasury.brlReceive.planAfterUnavailable')} (+${formatBrl(plan.amountBrl)} BRL)`
                        : undefined,
                  },
                ]}
              />
            </div>
          ) : null}
        </div>
      </div>
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
  const [refreshingPocket, setRefreshingPocket] = useState<TreasuryPocketId | null>(null);
  const [refillOpen, setRefillOpen] = useState(false);
  const [brlTransferOpen, setBrlTransferOpen] = useState(false);
  const [brlReceiveOpen, setBrlReceiveOpen] = useState(false);

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

  const refreshPocket = useCallback(
    async (pocket: TreasuryPocketId) => {
      setLoadError(null);
      setRefreshingPocket(pocket);

      try {
        const token = await getAccessToken();
        if (!token) {
          setLoadError(t('pages.treasury.errors.session'));
          return;
        }

        const response = await fetch(`/api/treasury/overview?pocket=${pocket}`, {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          setLoadError(body?.error?.trim() || t('pages.treasury.errors.loadFailed'));
          return;
        }

        const json = (await response.json()) as TreasuryPocketRefreshResponse;
        setOverview((previous) => {
          if (!previous) {
            return previous;
          }
          return {
            ...previous,
            pockets: {
              ...previous.pockets,
              [json.pocket]: json.data,
            } as TreasuryOverviewResponse['pockets'],
          };
        });
      } catch {
        setLoadError(t('pages.treasury.errors.loadFailed'));
      } finally {
        setRefreshingPocket(null);
      }
    },
    [t],
  );

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
  const recentRuns = overview?.recentRuns ?? [];
  const distributorExplorerUrl =
    pockets?.distributor.ok
      ? buildStellarExpertAccountUrl(
          pockets.distributor.address,
          pockets.distributor.stellarNetwork,
        )
      : null;

  const suggestedFree = {
    USDC: pockets?.binance.ok ? pockets.binance.usdc.free : null,
    XLM: pockets?.binance.ok ? pockets.binance.xlm.free : null,
  };

  const pocketRefreshBusy = refreshingPocket != null;
  const globalBusy = isLoading || isRefreshing || pocketRefreshBusy;

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
            disabled={globalBusy}
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
              <header className="treasury-pocket__header treasury-pocket__header--row">
                <span className="treasury-pocket__label">{t('pages.treasury.pockets.corpx')}</span>
                <PocketRefreshButton
                  pocket="corpx"
                  busy={refreshingPocket === 'corpx'}
                  disabled={globalBusy && refreshingPocket !== 'corpx'}
                  onRefresh={(id) => void refreshPocket(id)}
                  label={t('pages.treasury.refreshPocket')}
                />
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
              <footer className="treasury-pocket__footer">
                <button
                  type="button"
                  className="treasury-pocket__refill-link"
                  onClick={() => setBrlTransferOpen(true)}
                >
                  {t('pages.treasury.brlTransfer.open')}
                </button>
                <button
                  type="button"
                  className="treasury-pocket__refill-link"
                  onClick={() => setBrlReceiveOpen(true)}
                >
                  {t('pages.treasury.brlReceive.open')}
                </button>
              </footer>
            </article>

            <article className="surface treasury-pocket">
              <header className="treasury-pocket__header treasury-pocket__header--row">
                <span className="treasury-pocket__label">{t('pages.treasury.pockets.binance')}</span>
                <PocketRefreshButton
                  pocket="binance"
                  busy={refreshingPocket === 'binance'}
                  disabled={globalBusy && refreshingPocket !== 'binance'}
                  onRefresh={(id) => void refreshPocket(id)}
                  label={t('pages.treasury.refreshPocket')}
                />
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
                  <AssetRow
                    ticker="XLM"
                    amount={pockets.binance.xlm.free}
                    fractionDigits={4}
                    detail={`${t('pages.treasury.locked')}: ${formatAmount(pockets.binance.xlm.locked, 4)}`}
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
                <div className="treasury-pocket__title">
                  <span className="treasury-pocket__label">{t('pages.treasury.pockets.distributor')}</span>
                  {distributorExplorerUrl ? (
                    <a
                      className="treasury-pocket__explorer-icon"
                      href={distributorExplorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t('pages.treasury.explorerLinkAria')}
                      title={t('pages.treasury.explorerLinkAria')}
                    >
                      <ExternalLinkIcon width={14} height={14} aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
                <PocketRefreshButton
                  pocket="distributor"
                  busy={refreshingPocket === 'distributor'}
                  disabled={globalBusy && refreshingPocket !== 'distributor'}
                  onRefresh={(id) => void refreshPocket(id)}
                  label={t('pages.treasury.refreshPocket')}
                />
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
              <footer className="treasury-pocket__footer">
                <button
                  type="button"
                  className="treasury-pocket__refill-link"
                  onClick={() => setRefillOpen(true)}
                >
                  {t('pages.treasury.refill.open')}
                </button>
              </footer>
            </article>

            <article className="surface treasury-pocket treasury-pocket--muted">
              <header className="treasury-pocket__header treasury-pocket__header--row">
                <span className="treasury-pocket__label" title={t('pages.treasury.brhHint')}>
                  {t('pages.treasury.pockets.brh')}
                </span>
                <PocketRefreshButton
                  pocket="brh"
                  busy={refreshingPocket === 'brh'}
                  disabled={globalBusy && refreshingPocket !== 'brh'}
                  onRefresh={(id) => void refreshPocket(id)}
                  label={t('pages.treasury.refreshPocket')}
                />
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

          <section className="surface treasury-pending">
            <div className="dashboard-section-heading">
              <h2>{t('pages.treasury.runsTitle')}</h2>
            </div>
            <p className="surface__lead">{t('pages.treasury.runsHint')}</p>

            {!recentRuns.length ? (
              <p className="surface__lead">{t('pages.treasury.runsEmpty')}</p>
            ) : (
              <div className="user-management-table-wrap">
                <table className="user-management-table">
                  <thead>
                    <tr>
                      <th>{t('pages.treasury.columns.status')}</th>
                      <th>{t('pages.treasury.columns.asset')}</th>
                      <th>{t('pages.treasury.columns.amount')}</th>
                      <th>{t('pages.treasury.refill.trigger')}</th>
                      <th>{t('pages.treasury.columns.updatedAt')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentRuns.map((run) => {
                      const asset = treasuryAssetFromKind(run.kind);
                      return (
                        <tr key={run.id}>
                          <td>
                            {run.status}
                            {run.dry_run ? ' (dry-run)' : ''}
                          </td>
                          <td>{asset}</td>
                          <td>
                            {formatAmount(
                              run.executed_amount_usdc ?? run.requested_amount_usdc ?? '0',
                              4,
                            )}{' '}
                            {asset}
                          </td>
                          <td>{run.trigger}</td>
                          <td>{new Date(run.created_at).toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <RefillModal
        open={refillOpen}
        onClose={() => setRefillOpen(false)}
        suggestedFree={suggestedFree}
        busy={isLoading || isRefreshing}
        onExecuted={async () => {
          await loadOverview({ silent: true });
        }}
      />

      <BrlTransferModal
        open={brlTransferOpen}
        onClose={() => setBrlTransferOpen(false)}
        suggestedAvailable={pockets?.corpx.ok ? pockets.corpx.available : null}
        busy={isLoading || isRefreshing}
        onExecuted={async () => {
          await loadOverview({ silent: true });
        }}
      />

      <BrlReceiveModal
        open={brlReceiveOpen}
        onClose={() => setBrlReceiveOpen(false)}
        suggestedFree={pockets?.binance.ok ? pockets.binance.brl.free : null}
        busy={isLoading || isRefreshing}
        onExecuted={async () => {
          await loadOverview({ silent: true });
        }}
      />
    </section>
  );
}
