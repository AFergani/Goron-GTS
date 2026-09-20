/**
 * Champs personnalisés (variables de formulaires) — saisie ou lecture.
 */

import type { Dispatch, SetStateAction } from "react";
import { ToggleSwitch } from "./ToggleSwitch";
import { TimeInput } from "./TimeInput";
import type { FormVariableFieldDef } from "../model/formVariableField.types";

type FormVariableFieldsProps = {
  defs: FormVariableFieldDef[];
  values: Record<string, string>;
  onValuesChange: Dispatch<SetStateAction<Record<string, string>>>;
  disabled?: boolean;
  /** Titre de section. Ignoré en mode compact. */
  title?: string;
  /** Un seul champ, sans titre, pour le coller à droite d’un motif. */
  compact?: boolean;
  className?: string;
};

export function FormVariableFields({
  defs,
  values,
  onValuesChange,
  disabled = false,
  title = "Champs complémentaires (export Word)",
  compact = false,
  className
}: FormVariableFieldsProps) {
  if (!defs.length) return null;

  const fields = defs.map((def) => {
    const value = values[def.fieldKey] ?? "";
    const ph = def.placeholder?.trim() ? def.placeholder : undefined;
    const setVal = (next: string) => onValuesChange((prev) => ({ ...prev, [def.fieldKey]: next }));
    const fieldClass = compact ? "mc-field" : "mc-field mc-field-full";

    if (def.fieldType === "textarea") {
      return (
        <label key={def.fieldKey} className={fieldClass}>
          <span>{def.label}</span>
          <textarea
            value={value}
            disabled={disabled}
            onChange={(e) => setVal(e.target.value)}
            placeholder={ph}
            className="mc-textarea"
            rows={compact ? 2 : 3}
          />
        </label>
      );
    }
    if (def.fieldType === "number") {
      return (
        <label key={def.fieldKey} className={fieldClass}>
          <span>{def.label}</span>
          <input
            type="number"
            step="any"
            value={value}
            disabled={disabled}
            onChange={(e) => setVal(e.target.value)}
            placeholder={ph}
          />
        </label>
      );
    }
    if (def.fieldType === "time") {
      return (
        <label key={def.fieldKey} className={fieldClass}>
          <span>{def.label}</span>
          <TimeInput value={value} disabled={disabled} onChange={setVal} title={ph ?? def.label} />
        </label>
      );
    }
    if (def.fieldType === "select") {
      return (
        <label key={def.fieldKey} className={fieldClass}>
          <span>{def.label}</span>
          <select
            value={value}
            disabled={disabled}
            onChange={(e) => setVal(e.target.value)}
            aria-label={def.label}
          >
            <option value="">—</option>
            {def.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      );
    }
    if (def.fieldType === "toggle") {
      return (
        <div key={def.fieldKey} className={fieldClass}>
          <ToggleSwitch
            label={def.label}
            checked={value === "true" || value === "1" || value.toLowerCase() === "oui"}
            disabled={disabled}
            onChange={(next) => setVal(next ? "true" : "false")}
          />
        </div>
      );
    }
    return (
      <label key={def.fieldKey} className={fieldClass}>
        <span>{def.label}</span>
        <input value={value} disabled={disabled} onChange={(e) => setVal(e.target.value)} placeholder={ph} />
      </label>
    );
  });

  if (compact) {
    return <div className={className ?? "request-motif-row__extra"}>{fields}</div>;
  }

  return (
    <div className={className}>
      {title ? <h4 className="mc-modal-section-title">{title}</h4> : null}
      <div className="mc-form-grid mc-form-grid-manager">{fields}</div>
    </div>
  );
}
