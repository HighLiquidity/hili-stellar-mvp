import type { SVGProps } from 'react';

function IconBase(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props} />
  );
}

export function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </IconBase>
  );
}

export function DashboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M4 13h6V5H4z" />
      <path d="M14 20h6V11h-6z" />
      <path d="M14 7h6V4h-6z" />
      <path d="M4 20h6v-3H4z" />
    </IconBase>
  );
}

export function DepositIcon(props: SVGProps<SVGSVGElement>) {

  return (
    <IconBase {...props}>
      <path d="M12 4v16" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 20h14" />
    </IconBase>
  );
}

export function WithdrawIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M12 4v16" />
      <path d="m17 15-5 5-5-5" />
      <path d="M5 4h14" />
    </IconBase>
  );
}

export function StatementIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M8 9h8" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </IconBase>
  );
}

export function LogoutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M9 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </IconBase>
  );
}

export function SunIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5" />
      <path d="M12 19.5V22" />
      <path d="m4.93 4.93 1.77 1.77" />
      <path d="m17.3 17.3 1.77 1.77" />
      <path d="M2 12h2.5" />
      <path d="M19.5 12H22" />
      <path d="m4.93 19.07 1.77-1.77" />
      <path d="m17.3 6.7 1.77-1.77" />
    </IconBase>
  );
}

export function MoonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M20 14.5A7.5 7.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </IconBase>
  );
}

export function GlobeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14.5 14.5 0 0 1 0 18" />
      <path d="M12 3a14.5 14.5 0 0 0 0 18" />
    </IconBase>
  );
}
