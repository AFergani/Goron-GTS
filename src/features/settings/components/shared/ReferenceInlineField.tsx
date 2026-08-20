/**
 * Champ générique pour les référentiels de type libellé + couleur / date / simple input.
 *
 * Ce composant centralise le rendu des cas fréquents d'ajout / édition d'entrées
 * référentielles :
 * - libellé + couleur (types anomalie, motifs de ronde)
 * - date + libellé (jours fériés)
 * - libellé seul (intervenants, responsables Fransor)
 */

type ReferenceInlineFieldProps = {
  variant: "labelColor" | "labelDate" | "labelOnly";
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  colorValue?: string;
  onColorChange?: (value: string) => void;
  colorLabel?: string;
  dateValue?: string;
  onDateChange?: (value: string) => void;
  dateLabel?: string;
  datePlaceholder?: string;
  className?: string;
};

export function ReferenceInlineField({
  variant,
  label,
  value,
  onChange,
  placeholder,
  colorValue,
  onColorChange,
  colorLabel = "Couleur du badge",
  dateValue,
  onDateChange,
  dateLabel = "Date",
  datePlaceholder,
  className
}: ReferenceInlineFieldProps) {
  const containerClassName = className || "data-management-create-ref-form data-management-create-ref-form--anomaly-inline";

  return (
    <div className={containerClassName}>
      {variant !== "labelOnly" && (
        <label
          className={
            variant === "labelColor"
              ? "data-management-create-ref-form__label"
              : "data-management-create-ref-form__label data-management-create-ref-form__label--date"
          }
        >
          {variant === "labelColor" ? label : dateLabel}
          {variant === "labelColor" ? (
            <input placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
          ) : (
            <input
              type="date"
              className="data-management-create-ref-form__date-input"
              value={dateValue ?? value}
              placeholder={datePlaceholder}
              onChange={(e) => onDateChange?.(e.target.value)}
            />
          )}
        </label>
      )}

      {variant === "labelColor" && colorValue !== undefined && onColorChange ? (
        <label className="data-type-color-field">
          {colorLabel}
          <input type="color" value={colorValue} onChange={(e) => onColorChange(e.target.value)} />
        </label>
      ) : null}

      {variant === "labelDate" && (
        <label className="data-management-create-ref-form__label data-management-create-ref-form__label--grow">
          {label}
          <input
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      )}

      {variant === "labelOnly" && (
        <label className="data-management-create-ref-form__label">
          {label}
          <input placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
        </label>
      )}
    </div>
  );
}
