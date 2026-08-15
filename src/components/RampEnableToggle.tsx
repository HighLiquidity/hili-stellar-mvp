'use client';

type RampEnableToggleProps = {
  enabled: boolean;
  disabled?: boolean;
  onLabel: string;
  offLabel: string;
  ariaLabel: string;
  onRequestToggle: () => void;
};

export function RampEnableToggle({
  enabled,
  disabled = false,
  onLabel,
  offLabel,
  ariaLabel,
  onRequestToggle,
}: RampEnableToggleProps) {
  return (
    <div className="ramp-power-toggle">
      <span className={`ramp-power-toggle__state${enabled ? ' is-on' : ' is-off'}`}>
        {enabled ? onLabel : offLabel}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={ariaLabel}
        className={`ramp-power-toggle__switch${enabled ? ' is-on' : ''}`}
        disabled={disabled}
        onClick={onRequestToggle}
      >
        <span className="ramp-power-toggle__thumb" aria-hidden="true" />
      </button>
    </div>
  );
}
