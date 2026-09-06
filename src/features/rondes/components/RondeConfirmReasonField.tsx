/**
 * Champ motif obligatoire pour les ConfirmModal rondes (demande d'arrêt, suppression, refus…).
 */

type RondeConfirmReasonFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
};

export function RondeConfirmReasonField({
  value,
  onChange,
  disabled = false,
  placeholder,
  autoFocus = false
}: RondeConfirmReasonFieldProps) {
  return (
    <label className="mc-field" style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
      <span style={{ fontSize: "0.85em", fontWeight: 600 }}>
        Motif (obligatoire) <span className="text-error">*</span>
      </span>
      <textarea
        className="mc-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
      />
    </label>
  );
}
