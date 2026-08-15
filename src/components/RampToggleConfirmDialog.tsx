'use client';

import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';

import { CloseIcon } from './Icons';
import { Button } from './ui/Button';
import { InputField } from './ui/InputField';
import { useI18n } from '@/lib/i18n';

export const RAMP_TOGGLE_CONFIRM_SECONDS = 10;

export type RampToggleKind = 'usdc' | 'brh';

type RampToggleConfirmDialogProps = {
  open: boolean;
  ramp: RampToggleKind;
  nextEnabled: boolean;
  isSubmitting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function phraseKey(ramp: RampToggleKind, nextEnabled: boolean): string {
  if (ramp === 'usdc') {
    return nextEnabled ? 'pages.settings.confirm.phraseEnableUsdc' : 'pages.settings.confirm.phraseDisableUsdc';
  }
  return nextEnabled ? 'pages.settings.confirm.phraseEnableBrh' : 'pages.settings.confirm.phraseDisableBrh';
}

export function RampToggleConfirmDialog({
  open,
  ramp,
  nextEnabled,
  isSubmitting = false,
  onCancel,
  onConfirm,
}: RampToggleConfirmDialogProps) {
  const { t } = useI18n();
  const titleId = useId();
  const inputId = useId();
  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(RAMP_TOGGLE_CONFIRM_SECONDS);

  const rampTitle = ramp === 'usdc' ? t('pages.settings.usdcTitle') : t('pages.settings.brhTitle');
  const expectedPhrase = t(phraseKey(ramp, nextEnabled));
  const phraseMatches = typed.trim() === expectedPhrase;
  const disabling = !nextEnabled;

  useEffect(() => {
    if (!open) {
      setStep(1);
      setTyped('');
      setSecondsLeft(RAMP_TOGGLE_CONFIRM_SECONDS);
    }
  }, [open]);

  useEffect(() => {
    if (!open || step !== 2) return;

    setSecondsLeft(RAMP_TOGGLE_CONFIRM_SECONDS);
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const left = Math.max(0, RAMP_TOGGLE_CONFIRM_SECONDS - elapsed);
      setSecondsLeft(left);
      if (left === 0) {
        window.clearInterval(id);
      }
    }, 250);

    return () => window.clearInterval(id);
  }, [open, step]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSubmitting) {
        onCancel();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSubmitting, onCancel, open]);

  const copy = useMemo(() => {
    if (disabling) {
      return {
        title: t('pages.settings.confirm.disableTitle').replace('{{ramp}}', rampTitle),
        body: t('pages.settings.confirm.disableBody').replace('{{ramp}}', rampTitle),
        finalTitle: t('pages.settings.confirm.finalDisableTitle'),
        finalBody: t('pages.settings.confirm.finalDisableBody').replace('{{ramp}}', rampTitle),
      };
    }
    return {
      title: t('pages.settings.confirm.enableTitle').replace('{{ramp}}', rampTitle),
      body: t('pages.settings.confirm.enableBody').replace('{{ramp}}', rampTitle),
      finalTitle: t('pages.settings.confirm.finalEnableTitle'),
      finalBody: t('pages.settings.confirm.finalEnableBody').replace('{{ramp}}', rampTitle),
    };
  }, [disabling, rampTitle, t]);

  if (!open) return null;

  const handleContinue = (event: FormEvent) => {
    event.preventDefault();
    if (!phraseMatches || isSubmitting) return;
    setStep(2);
  };

  const okReady = secondsLeft === 0 && !isSubmitting;
  const okLabel =
    secondsLeft > 0
      ? t('pages.settings.confirm.okWait').replace('{{seconds}}', String(secondsLeft))
      : isSubmitting
        ? t('pages.settings.confirm.submitting')
        : t('pages.settings.confirm.ok');

  return (
    <div
      className="treasury-modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onCancel();
      }}
    >
      <div
        className={`treasury-modal ramp-confirm-dialog${disabling ? ' ramp-confirm-dialog--disable' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="treasury-modal__header">
          <div className="treasury-modal__heading">
            <p className="ramp-confirm-dialog__step">
              {t('pages.settings.confirm.step').replace('{{step}}', String(step))}
            </p>
            <h2 id={titleId} className="treasury-modal__title">
              {step === 1 ? copy.title : copy.finalTitle}
            </h2>
          </div>
          <button
            type="button"
            className="treasury-modal__close"
            onClick={onCancel}
            disabled={isSubmitting}
            aria-label={t('pages.settings.confirm.cancel')}
            title={t('pages.settings.confirm.cancel')}
          >
            <CloseIcon width={16} height={16} aria-hidden="true" />
          </button>
        </header>

        <div className="treasury-modal__body">
          {step === 1 ? (
            <form className="ramp-confirm-dialog__form" onSubmit={handleContinue}>
              <p className={`ramp-confirm-banner${disabling ? ' ramp-confirm-banner--danger' : ''}`}>{copy.body}</p>
              <p className="ramp-confirm-dialog__type-label">{t('pages.settings.confirm.typeLabel')}</p>
              <code className="ramp-confirm-phrase">{expectedPhrase}</code>
              <InputField
                id={inputId}
                label={t('pages.settings.confirm.typeField')}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                disabled={isSubmitting}
                placeholder={t('pages.settings.confirm.typePlaceholder')}
                required
              />
              <div className="treasury-modal__actions ramp-confirm-dialog__actions">
                <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
                  {t('pages.settings.confirm.cancel')}
                </Button>
                <Button type="submit" variant={disabling ? 'danger' : 'primary'} disabled={!phraseMatches || isSubmitting}>
                  {t('pages.settings.confirm.continue')}
                </Button>
              </div>
            </form>
          ) : (
            <>
              <p className={`ramp-confirm-banner${disabling ? ' ramp-confirm-banner--danger' : ''}`}>{copy.finalBody}</p>
              <div className="treasury-modal__actions ramp-confirm-dialog__actions">
                <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
                  {t('pages.settings.confirm.cancel')}
                </Button>
                <Button type="button" variant={disabling ? 'danger' : 'primary'} disabled={!okReady} onClick={onConfirm}>
                  {okLabel}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
