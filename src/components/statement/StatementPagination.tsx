'use client';

import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n';

type StatementPaginationProps = {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
};

export function StatementPagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  disabled = false,
}: StatementPaginationProps) {
  const { t } = useI18n();

  if (total === 0) {
    return null;
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav className="statement-pagination" aria-label={t('pages.statement.paginationLabel')}>
      <p className="statement-pagination__info">
        {t('pages.statement.paginationRange')
          .replace('{{from}}', String(from))
          .replace('{{to}}', String(to))
          .replace('{{total}}', String(total))}
      </p>
      <div className="statement-pagination__controls">
        <Button
          type="button"
          variant="ghost"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          {t('pages.statement.paginationPrev')}
        </Button>
        <span className="statement-pagination__page">
          {t('pages.statement.paginationPage')
            .replace('{{page}}', String(page))
            .replace('{{pages}}', String(totalPages))}
        </span>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          {t('pages.statement.paginationNext')}
        </Button>
      </div>
    </nav>
  );
}
