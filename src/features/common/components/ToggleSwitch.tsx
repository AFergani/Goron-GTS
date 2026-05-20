type ToggleSwitchProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  /** Libellé à gauche, curseur à droite (flex space-between) */
  labelFirst?: boolean;
  /** Masque le libellé visuel (curseur seul) ; `label` reste utilisé pour aria-label / title */
  labelHidden?: boolean;
  /** Infobulle native au survol (sinon le libellé court) */
  tooltip?: string;
  /** Texte annoncé par les lecteurs d’écran (sinon tooltip ou libellé) */
  ariaLabel?: string;
};

export function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled = false,
  labelFirst = false,
  labelHidden = false,
  tooltip,
  ariaLabel
}: ToggleSwitchProps) {
  const track = (
    <span className="toggle-switch__track" aria-hidden="true">
      <span className="toggle-switch__thumb" />
    </span>
  );
  const labelEl = <span className="toggle-switch__label">{label}</span>;
  const body =
    labelHidden ? (
      track
    ) : labelFirst ? (
      <>
        {labelEl}
        {track}
      </>
    ) : (
      <>
        {track}
        {labelEl}
      </>
    );
  const titleAttr = tooltip ?? label;
  const ariaLabelAttr = ariaLabel ?? tooltip ?? label;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabelAttr}
      title={titleAttr}
      disabled={disabled}
      className={`toggle-switch ${checked ? "is-on" : "is-off"}${labelHidden ? " toggle-switch--label-hidden" : ""}`}
      onClick={() => {
        if (disabled) return;
        onChange(!checked);
      }}
    >
      {body}
    </button>
  );
}
