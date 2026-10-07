/**
 * Types et libellés de champs pour modèles Word et panneau variables.
 */

import type { FormVariableFieldType } from "./formVariables.types";

/** Types proposés à la création d’une variable de formulaire. */
export const WORD_TEMPLATE_FIELD_TYPES: Array<{ value: FormVariableFieldType; label: string }> = [
  { value: "text", label: "Texte court" },
  { value: "textarea", label: "Texte long" },
  { value: "number", label: "Nombre" },
  { value: "time", label: "Heure" },
  { value: "select", label: "Liste déroulante" },
  { value: "checkbox", label: "Case à cocher" }
];

/** Libellé français du type de champ (tableaux, modales). */
export function wordTemplateFieldTypeLabel(t: FormVariableFieldType): string {
  return WORD_TEMPLATE_FIELD_TYPES.find((o) => o.value === t)?.label ?? t;
}

/** Dérive le nom de variable BDD / Word depuis le libellé (espaces → _, accents retirés, etc.). */
export function labelToFieldKey(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";

  let s = trimmed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  if (!s.length) return "";

  if (/^[0-9]/.test(s)) {
    s = `v_${s}`;
  } else if (!/^[a-z]/.test(s)) {
    const idx = s.search(/[a-z]/);
    if (idx === -1) return "";
    s = s.slice(idx);
  }

  s = s.slice(0, 63);

  if (!/^[a-z][a-z0-9_]{0,62}$/.test(s)) return "";

  return s;
}
