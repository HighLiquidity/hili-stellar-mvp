'use client';

import { useState, type ReactNode } from 'react';

export type RampCollapsiblePanelProps = {
  className?: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  titleAs?: 'h3' | 'span';
  badge?: ReactNode;
  headerActions?: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
};

export function RampCollapsiblePanel({
  className,
  eyebrow,
  title,
  subtitle,
  titleAs = 'span',
  badge,
  headerActions,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  children,
}: RampCollapsiblePanelProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen = controlledOpen ?? uncontrolledOpen;
  const hasToolbar = Boolean(badge || headerActions);
  const TitleTag = titleAs === 'h3' ? 'h3' : 'span';

  function setIsOpen(next: boolean) {
    onOpenChange?.(next);
    if (controlledOpen === undefined) {
      setUncontrolledOpen(next);
    }
  }

  return (
    <article className={['surface onramp-collapsible', className].filter(Boolean).join(' ')}>
      <div
        className={
          hasToolbar ? 'onramp-collapsible__header' : 'onramp-collapsible__header onramp-collapsible__header--solo'
        }
      >
        <button
          type="button"
          className="onramp-collapsible__toggle"
          aria-expanded={isOpen}
          onClick={() => setIsOpen(!isOpen)}
        >
          <span className="onramp-collapsible__heading">
            {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
            <TitleTag className="onramp-collapsible__title">{title}</TitleTag>
            {subtitle ? <span className="onramp-collapsible__subtitle surface__lead">{subtitle}</span> : null}
          </span>
          <span className={`onramp-collapsible__chevron${isOpen ? ' is-open' : ''}`} aria-hidden="true" />
        </button>
        {hasToolbar ? (
          <div className="onramp-collapsible__toolbar">
            {badge}
            {headerActions}
          </div>
        ) : null}
      </div>
      {isOpen ? <div className="onramp-collapsible__body">{children}</div> : null}
    </article>
  );
}
