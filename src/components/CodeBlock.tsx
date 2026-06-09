'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n';

type CodeBlockProps = {
  code: string;
  label?: string;
};

export function CodeBlock({ code, label }: CodeBlockProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="code-block">
      {label ? <p className="code-block__label">{label}</p> : null}
      <div className="code-block__toolbar">
        <Button type="button" variant="ghost" onClick={() => void handleCopy()}>
          {copied ? t('pages.apiIntegration.docs.copied') : t('pages.apiIntegration.docs.copy')}
        </Button>
      </div>
      <pre className="code-block__pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}
