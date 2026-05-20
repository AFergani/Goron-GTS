import type { Dispatch, SetStateAction } from "react";
import { CreateFormSection } from "../../common/components/CreateFormSection";
import type { RondePlannedProfileRef } from "../model/rondePlanned.types";

type RondeClosureFieldsEditorProps = {
  profile: RondePlannedProfileRef | null | undefined;
  title?: string;
  values: Record<string, string>;
  onValuesChange: Dispatch<SetStateAction<Record<string, string>>>;
  resolveFieldLabel: (template: string) => string;
  disabled?: boolean;
};

export function RondeClosureFieldsEditor({
  profile,
  title = "Champs complémentaires pour ce site",
  values,
  onValuesChange,
  resolveFieldLabel,
  disabled = false
}: RondeClosureFieldsEditorProps) {
  if (!profile?.closureFormEnabled || !profile.closureFields?.length) return null;

  return (
    <CreateFormSection title={title}>
      <div className="mc-form-grid mc-form-grid-align-start ronde-closure-fields-grid">
        {profile.closureFields.map((field) => {
          const currentValue = values[field.key] ?? "";
          const resolvedLabel = resolveFieldLabel(field.labelTemplate) || field.labelTemplate || field.key;
          if (field.type === "textarea") {
            return (
              <label key={field.id} className="mc-field mc-field-full mc-field-span-2">
                <span>{resolvedLabel}</span>
                <textarea
                  value={currentValue}
                  disabled={disabled}
                  onChange={(e) => onValuesChange((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  className="mc-textarea mc-textarea-inline-pair"
                  rows={3}
                  placeholder={field.placeholder || undefined}
                  required={field.required}
                />
              </label>
            );
          }
          if (field.type === "select") {
            return (
              <label key={field.id} className="mc-field">
                <span>{resolvedLabel}</span>
                <select
                  value={currentValue}
                  disabled={disabled}
                  required={field.required}
                  onChange={(e) => onValuesChange((prev) => ({ ...prev, [field.key]: e.target.value }))}
                >
                  <option value="">{field.placeholder || "—"}</option>
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            );
          }
          return (
            <label key={field.id} className="mc-field">
              <span>{resolvedLabel}</span>
              <input
                type={field.type === "number" || field.type === "time" ? field.type : "text"}
                value={currentValue}
                disabled={disabled}
                onChange={(e) => onValuesChange((prev) => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder || undefined}
                required={field.required}
              />
            </label>
          );
        })}
      </div>
    </CreateFormSection>
  );
}
