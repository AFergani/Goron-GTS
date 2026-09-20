/**
 * Jetons Word partagés entre fiches (main courante, intervention, ronde).
 *
 * Un même concept utilise le même nom sur tous les flux.
 */

import { splitSiteDisplayParts } from "./siteDisplayCopy";
import { safeDocxText } from "./docxTemplateHelpers";

/** Clés internes : ne pas écraser les jetons formatés du compte-rendu. */
const RESERVED_FORM_VARIABLE_DOCX_KEYS = new Set(["date_logique_passage", "date_logique", "transition_date"]);

/**
 * Jetons site communs à toutes les fiches.
 *
 * @param siteDisplay - Libellé affiché « Nom (CODE) »
 */
export function siteDocxFields(siteDisplay: string | null | undefined): Record<string, string> {
  const raw = String(siteDisplay || "").trim();
  const parts = splitSiteDisplayParts(raw);
  return {
    site: safeDocxText(raw),
    site_code: safeDocxText(parts.codePart),
    site_name: safeDocxText(parts.namePart)
  };
}

/** Variables de formulaire → jetons Docxtemplater. */
export function formVariableDocxExtras(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const extras: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const k = String(key || "").trim();
    if (!k || RESERVED_FORM_VARIABLE_DOCX_KEYS.has(k)) continue;
    extras[k] = safeDocxText(value == null ? "" : String(value));
  }
  return extras;
}
