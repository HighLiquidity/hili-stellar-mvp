'use client';

import { buildStellarExpertTxUrl, extractStellarTxHash } from '@/lib/stellar/explorer-url';
import { useI18n } from '@/lib/i18n';

type CryptoTxHashLinkProps = {
  txHash: string;
};

export function CryptoTxHashLink({ txHash }: CryptoTxHashLinkProps) {
  const { t } = useI18n();
  const hash = extractStellarTxHash(txHash);
  const explorerUrl = buildStellarExpertTxUrl(txHash);
  const label = hash ?? txHash.trim();

  if (!explorerUrl || !hash) {
    return <code className="transaction-item__hash-value">{label}</code>;
  }

  return (
    <a
      href={explorerUrl}
      className="transaction-item__hash-link"
      target="_blank"
      rel="noopener noreferrer"
      title={t('pages.ledger.cryptoHashOpenExplorer')}
      aria-label={`${t('pages.ledger.cryptoHashOpenExplorer')}: ${hash}`}
    >
      <code className="transaction-item__hash-value">{hash}</code>
    </a>
  );
}
