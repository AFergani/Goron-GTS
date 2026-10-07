/**
 * Jetons Word partagés entre fiches (main courante, intervention, ronde).
 *
 * Un même concept utilise le même nom sur tous les flux.
 */

import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import { splitSiteDisplayParts } from "./siteDisplayCopy";
import { safeDocxText } from "./docxTemplateHelpers";

/** Clés internes : ne pas écraser les jetons formatés du compte-rendu. */
const RESERVED_FORM_VARIABLE_DOCX_KEYS = new Set([
  "date_logique_passage",
  "date_logique",
  "transition_date",
  "adresse_site"
]);

/** Référentiel site suffisant pour remplir `{adresse_site}`. */
export type SiteAddressRef = {
  id?: string;
  code?: string;
  address?: string;
};

/**
 * Adresse du référentiel : d’abord par identifiant de fiche, sinon par code du libellé.
 *
 * @param siteDisplay - Libellé affiché « Nom (CODE) »
 * @param siteId - Identifiant du site sur la fiche, s’il est connu
 * @param sites - Sites chargés sur la page
 */
function resolveSiteAddress(
  siteDisplay: string,
  siteId: string | null | undefined,
  sites: SiteAddressRef[] | null | undefined
): string {
  const list = sites || [];
  const id = String(siteId || "").trim();
  if (id) {
    const byId = list.find((site) => String(site.id || "").trim() === id);
    if (byId) return String(byId.address || "").trim();
  }
  const code = splitSiteDisplayParts(siteDisplay).codePart.trim().toLowerCase();
  if (!code) return "";
  const byCode = list.find((site) => String(site.code || "").trim().toLowerCase() === code);
  return String(byCode?.address || "").trim();
}

/**
 * Jetons site communs à toutes les fiches.
 *
 * @param siteDisplay - Libellé affiché « Nom (CODE) »
 * @param options - Site de la fiche et référentiel, pour `{adresse_site}`
 */
export function siteDocxFields(
  siteDisplay: string | null | undefined,
  options?: { siteId?: string | null; sites?: SiteAddressRef[] | null }
): Record<string, string> {
  const raw = String(siteDisplay || "").trim();
  const parts = splitSiteDisplayParts(raw);
  return {
    site: safeDocxText(raw),
    site_code: safeDocxText(parts.codePart),
    site_name: safeDocxText(parts.namePart),
    adresse_site: safeDocxText(resolveSiteAddress(raw, options?.siteId, options?.sites))
  };
}

/** Case à cocher cochée : la fiche n’enregistre que `X`. */
export function isFormCheckboxChecked(value: unknown): boolean {
  return String(value ?? "").trim().toLowerCase() === "x";
}

/**
 * Clés des cases à cocher, pour écrire `X` ou vide dans le Word (pas « — »).
 *
 * @returns Ensemble de `fieldKey`, vide si le référentiel est injoignable.
 */
export async function loadCheckboxFieldKeys(): Promise<Set<string>> {
  try {
    const rows = await gtsApiClient.listFormVariables({ requesterRole: "OPERATEUR" });
    return new Set(
      rows
        .filter((row) => row.fieldType === "checkbox")
        .map((row) => String(row.fieldKey || "").trim())
        .filter(Boolean)
    );
  } catch {
    return new Set();
  }
}

/**
 * Variables de formulaire → jetons Docxtemplater.
 *
 * Une case à cocher n’écrit que `X` ou une chaîne vide : le libellé est déjà dans le modèle Word.
 * Les cases absentes de la fiche sont quand même envoyées vides, pour ne pas laisser le jeton ni « — ».
 */
export function formVariableDocxExtras(raw: unknown, checkboxKeys?: Iterable<string> | null): Record<string, string> {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const checkboxes = new Set(
    [...(checkboxKeys || [])].map((key) => String(key || "").trim()).filter(Boolean)
  );
  const extras: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    const k = String(key || "").trim();
    if (!k || RESERVED_FORM_VARIABLE_DOCX_KEYS.has(k) || checkboxes.has(k)) continue;
    extras[k] = safeDocxText(value == null ? "" : String(value));
  }
  for (const key of checkboxes) {
    if (RESERVED_FORM_VARIABLE_DOCX_KEYS.has(key)) continue;
    extras[key] = isFormCheckboxChecked(source[key]) ? "X" : "";
  }
  return extras;
}
