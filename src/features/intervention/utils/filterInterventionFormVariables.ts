/**
 * Filtre les variables de formulaire applicables à une intervention (FORM + scopes site/famille).
 */

import type { SiteRef } from "../../../types";
import type { FormVariableDef } from "../../settings/model/formVariables.types";
import type { InterventionFormFieldDef } from "../model/interventionFormFields.types";

function normalizeInterventionFieldType(raw: unknown): InterventionFormFieldDef["fieldType"] {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "textarea" || s === "number" || s === "time" || s === "select" || s === "toggle") return s;
  return "text";
}

export function filterInterventionFormVariables(
  rows: FormVariableDef[],
  selectedSite: SiteRef | null
): InterventionFormFieldDef[] {
  const selectedFamille = String(selectedSite?.famille || "").trim().toUpperCase();
  return rows
    .filter((row) => row.assignments.some((a) => a.kind === "FORM" && a.value === "INTERVENTION"))
    .filter((row) => {
      const siteScopes = row.assignments.filter((a) => a.kind === "SITE").map((a) => String(a.value || "").trim());
      const familleScopes = row.assignments
        .filter((a) => a.kind === "FAMILLE")
        .map((a) => String(a.value || "").trim().toUpperCase());
      if (!siteScopes.length && !familleScopes.length) return true;
      if (siteScopes.length && selectedSite?.id && siteScopes.includes(selectedSite.id)) return true;
      if (familleScopes.length && selectedFamille && familleScopes.includes(selectedFamille)) return true;
      return false;
    })
    .map((r) => ({
      id: r.id,
      sortOrder: r.sortOrder,
      fieldKey: r.fieldKey,
      label: r.label,
      fieldType: normalizeInterventionFieldType(r.fieldType),
      placeholder: r.placeholder ?? "",
      options: Array.isArray(r.options) ? r.options : [],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }));
}
