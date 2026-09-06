/**
 * Champs complémentaires Word (variables FORM=INTERVENTION).
 */

import type { Dispatch, SetStateAction } from "react";
import { ToggleSwitch } from "../../common/components/ToggleSwitch";
import { TimeInput } from "../../common/components/TimeInput";
import type { InterventionFormFieldDef } from "../model/interventionFormFields.types";

type InterventionExportExtraFieldsProps = {
  defs: InterventionFormFieldDef[];
  values: Record<string, string>;
  onValuesChange: Dispatch<SetStateAction<Record<string, string>>>;
  disabled?: boolean;
};

export function InterventionExportExtraFields({
  defs,
  values,
  onValuesChange,
  disabled = false
}: InterventionExportExtraFieldsProps) {
  if (!defs.length) return null;

  return (
    <>
      <h4 className="mc-modal-section-title">Champs complémentaires (export Word)</h4>
      <div className="mc-form-grid mc-form-grid-manager">
        {defs.map((def) => {
          const value = values[def.fieldKey] ?? "";
          const ph = def.placeholder?.trim() ? def.placeholder : undefined;
          const setVal = (next: string) => onValuesChange((prev) => ({ ...prev, [def.fieldKey]: next }));

          if (def.fieldType === "textarea") {
            return (
              <label key={def.fieldKey} className="mc-field mc-field-full">
                <span>{def.label}</span>
                <textarea
                  value={value}
                  disabled={disabled}
                  onChange={(e) => setVal(e.target.value)}
                  placeholder={ph}
                  className="mc-textarea"
                  rows={3}
                />
              </label>
            );
          }
          if (def.fieldType === "number") {
            return (
              <label key={def.fieldKey} className="mc-field mc-field-full">
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
              <label key={def.fieldKey} className="mc-field mc-field-full">
                <span>{def.label}</span>
                <TimeInput value={value} disabled={disabled} onChange={setVal} title={ph ?? def.label} />
              </label>
            );
          }
          if (def.fieldType === "select") {
            return (
              <label key={def.fieldKey} className="mc-field mc-field-full">
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
              <div key={def.fieldKey} className="mc-field mc-field-full">
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
            <label key={def.fieldKey} className="mc-field mc-field-full">
              <span>{def.label}</span>
              <input value={value} disabled={disabled} onChange={(e) => setVal(e.target.value)} placeholder={ph} />
            </label>
          );
        })}
      </div>
    </>
  );
}
