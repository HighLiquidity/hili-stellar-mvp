import { extractStellarTxHash } from '@/lib/stellar/explorer-url';

import type { LedgerTransaction } from './types';

export type StatementExportFormat = 'csv' | 'pdf' | 'ofx';

export type StatementExportLabels = {
  deposit: string;
  withdraw: string;
  onramp: string;
  offramp: string;
  cryptoPending: string;
  fileBaseName: string;
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatExportDate(iso: string, localeCode: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(localeCode, {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(d);
}

function typeLabel(tx: LedgerTransaction, labels: StatementExportLabels): string {
  if (tx.kind === 'onramp') return labels.onramp;
  if (tx.kind === 'offramp') return labels.offramp;
  return tx.type === 'deposit' ? labels.deposit : labels.withdraw;
}

export function exportStatementCsv(
  rows: LedgerTransaction[],
  labels: StatementExportLabels,
  localeCode: string,
): void {
  const header = [
    'date',
    'type',
    'amount_brl',
    'pix_e2e',
    'crypto_tx_hash',
    'beneficiary',
  ];
  const lines = [
    header.join(','),
    ...rows.map((tx) =>
      [
        escapeCsvCell(formatExportDate(tx.createdAt, localeCode)),
        escapeCsvCell(typeLabel(tx, labels)),
        escapeCsvCell(tx.amountBrl),
        escapeCsvCell(tx.pixE2eId ?? ''),
        escapeCsvCell(extractStellarTxHash(tx.txHash ?? '') ?? tx.txHash ?? ''),
        escapeCsvCell(tx.beneficiaryName ?? ''),
      ].join(','),
    ),
  ];

  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `${labels.fileBaseName}.csv`);
}

function ofxEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ofxDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function exportStatementOfx(rows: LedgerTransaction[], labels: StatementExportLabels): void {
  const now = ofxDate(new Date().toISOString());
  const transactions = rows
    .map((tx) => {
      const amount = Number(tx.amountBrl.replace(',', '.'));
      const signed = tx.type === 'deposit' ? Math.abs(amount) : -Math.abs(amount);
      const trnType = tx.type === 'deposit' ? 'CREDIT' : 'DEBIT';
      const memo = [
        typeLabel(tx, labels),
        tx.beneficiaryName ? `Beneficiary: ${tx.beneficiaryName}` : null,
        tx.txHash ? `Hash: ${extractStellarTxHash(tx.txHash) ?? tx.txHash}` : null,
        tx.pixE2eId ? `E2E: ${tx.pixE2eId}` : null,
      ]
        .filter(Boolean)
        .join(' | ');

      return `<STMTTRN>
<TRNTYPE>${trnType}</TRNTYPE>
<DTPOSTED>${ofxDate(tx.createdAt)}</DTPOSTED>
<TRNAMT>${signed.toFixed(2)}</TRNAMT>
<FITID>${ofxEscape(tx.id)}</FITID>
<MEMO>${ofxEscape(memo)}</MEMO>
</STMTTRN>`;
    })
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS><CODE>0</CODE></STATUS>
<DTSERVER>${now}</DTSERVER>
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<DTSTART>${rows.length ? ofxDate(rows[rows.length - 1]!.createdAt) : now}</DTSTART>
<DTEND>${rows.length ? ofxDate(rows[0]!.createdAt) : now}</DTEND>
${transactions}
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

  const blob = new Blob([body], { type: 'application/x-ofx;charset=utf-8' });
  downloadBlob(blob, `${labels.fileBaseName}.ofx`);
}

export async function exportStatementPdf(
  rows: LedgerTransaction[],
  labels: StatementExportLabels,
  localeCode: string,
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const margin = 14;
  let y = margin;
  const lineHeight = 6;
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFontSize(14);
  doc.text(labels.fileBaseName, margin, y);
  y += lineHeight + 2;
  doc.setFontSize(9);

  for (const tx of rows) {
    const lines = [
      `${formatExportDate(tx.createdAt, localeCode)}  |  ${typeLabel(tx, labels)}  |  R$ ${tx.amountBrl}`,
      `PIX E2E: ${tx.pixE2eId ?? '—'}`,
      `Hash: ${tx.txHash ? (extractStellarTxHash(tx.txHash) ?? tx.txHash) : labels.cryptoPending}`,
      tx.beneficiaryName ? `Beneficiário: ${tx.beneficiaryName}` : '',
    ].filter(Boolean);

    for (const line of lines) {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      const wrapped = doc.splitTextToSize(line, doc.internal.pageSize.getWidth() - margin * 2);
      doc.text(wrapped, margin, y);
      y += wrapped.length * (lineHeight - 1) + 2;
    }
    y += 2;
  }

  if (rows.length === 0) {
    doc.text('—', margin, y);
  }

  doc.save(`${labels.fileBaseName}.pdf`);
}

export async function exportStatement(
  format: StatementExportFormat,
  rows: LedgerTransaction[],
  labels: StatementExportLabels,
  localeCode: string,
): Promise<void> {
  switch (format) {
    case 'csv':
      exportStatementCsv(rows, labels, localeCode);
      break;
    case 'ofx':
      exportStatementOfx(rows, labels);
      break;
    case 'pdf':
      await exportStatementPdf(rows, labels, localeCode);
      break;
    default:
      break;
  }
}
