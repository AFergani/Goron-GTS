/**
 * Filtre les variables de formulaire selon la cible, le site/famille et le profil ronde.
 */

import type { SiteRef } from "../../../types";
import {
  normalizeFormVariableEntryStage,
  type FormTarget,
  type FormVariableDef
} from "../../settings/model/formVariables.types";
import type { FormVariableFieldDef } from "../model/formVariableField.types";

function normalizeFieldType(raw: unknown): FormVariableFieldDef["fieldType"] {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "textarea" || s === "number" || s === "time" || s === "select" || s === "toggle" || s === "checkbox") return s;
  return "text";
}

export function filterFormVariables(
  rows: FormVariableDef[],
  formTarget: FormTarget,
  selectedSite: SiteRef | null,
  plannedProfileId?: string | null
): FormVariableFieldDef[] {
  const selectedFamille = String(selectedSite?.famille || "").trim().toUpperCase();
  const profileId = String(plannedProfileId || "").trim();
  return rows
    .filter((row) => row.assignments.some((a) => a.kind === "FORM" && a.value === formTarget))
    .filter((row) => {
      if (formTarget !== "RONDE_PLANIFIEE") return true;
      const profileScopes = row.assignments
        .filter((a) => a.kind === "PROFILE")
        .map((a) => String(a.value || "").trim())
        .filter(Boolean);
      if (!profileScopes.length) return true;
      return Boolean(profileId && profileScopes.includes(profileId));
    })
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
      fieldType: normalizeFieldType(r.fieldType),
      placeholder: r.placeholder ?? "",
      options: Array.isArray(r.options) ? r.options : [],
      entryStage: normalizeFormVariableEntryStage(r.entryStage),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }));
}
