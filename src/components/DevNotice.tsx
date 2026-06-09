import type { ReactNode } from 'react';

type DevNoticeVariant = 'info' | 'warning' | 'success';

type DevNoticeProps = {
  title: string;
  children: ReactNode;
  badge?: string;
  variant?: DevNoticeVariant;
};

export function DevNotice({ title, children, badge, variant = 'info' }: DevNoticeProps) {
  return (
    <aside className={`dev-notice dev-notice--${variant}`} role="note">
      <div className="dev-notice__header">
        <strong>{title}</strong>
        {badge ? <span className="dev-notice__badge">{badge}</span> : null}
      </div>
      <div className="dev-notice__body">{children}</div>
    </aside>
  );
}
