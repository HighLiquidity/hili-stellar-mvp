'use client';

import { useState } from 'react';

import { CheckIcon, CopyIcon } from '@/components/Icons';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n';

type ApiKeySecretRevealProps = {
  keyPrefix: string;
  secret: string;
  onClose: () => void;
};

type CopyableRowProps = {
  id: string;
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  copyLabel: string;
  copiedLabel: string;
};

function CopyableCredentialRow({
  id,
  label,
  value,
  copied,
  onCopy,
  copyLabel,
  copiedLabel,
}: CopyableRowProps) {
  return (
    <div className="api-key-secret-reveal__field">
      <label className="api-key-secret-reveal__label" htmlFor={id}>
        {label}
      </label>
      <div className="api-key-secret-reveal__value-row">
        <code id={id} className="api-key-secret-reveal__value">
          {value}
        </code>
        <button
          type="button"
          className="icon-button api-key-secret-reveal__copy-button"
          onClick={onCopy}
          aria-label={copied ? copiedLabel : copyLabel}
          title={copied ? copiedLabel : copyLabel}
        >
          {copied ? <CheckIcon width={18} height={18} /> : <CopyIcon width={18} height={18} />}
        </button>
      </div>
    </div>
  );
}

export function ApiKeySecretReveal({ keyPrefix, secret, onClose }: ApiKeySecretRevealProps) {
  const { t } = useI18n();
  const [copiedField, setCopiedField] = useState<'prefix' | 'secret' | null>(null);

  const copyValue = async (field: 'prefix' | 'secret', value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 2000);
    } catch {
      setCopiedField(null);
    }
  };

  const copyLabel = t('pages.apiIntegration.docs.copy');
  const copiedLabel = t('pages.apiIntegration.docs.copied');

  return (
    <div className="api-key-secret-reveal" role="dialog" aria-modal="true" aria-labelledby="api-key-secret-title">
      <h3 id="api-key-secret-title" className="api-key-secret-reveal__title">
        {t('pages.apiIntegration.keys.secretTitle')}
      </h3>
      <p className="surface__lead">{t('pages.apiIntegration.keys.secretLead')}</p>

      <CopyableCredentialRow
        id="api-key-prefix-value"
        label={t('pages.apiIntegration.keys.columns.prefix')}
        value={keyPrefix}
        copied={copiedField === 'prefix'}
        onCopy={() => void copyValue('prefix', keyPrefix)}
        copyLabel={copyLabel}
        copiedLabel={copiedLabel}
      />

      <CopyableCredentialRow
        id="api-key-secret-value"
        label={t('pages.apiIntegration.keys.secretLabel')}
        value={secret}
        copied={copiedField === 'secret'}
        onCopy={() => void copyValue('secret', secret)}
        copyLabel={copyLabel}
        copiedLabel={copiedLabel}
      />

      <div className="api-key-secret-reveal__actions">
        <Button type="button" variant="primary" onClick={onClose}>
          {t('pages.apiIntegration.keys.secretClose')}
        </Button>
      </div>
    </div>
  );
}
