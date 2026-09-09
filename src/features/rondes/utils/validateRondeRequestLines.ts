/**
 * Validation des lignes brouillon avant submit demande / programmation.
 */

import {
  hasCompleteRandomWindow,
  hasPartialRandomWindow,
  rondeRequestLineDisplayNumber,
  type LineDraft
} from "../model/rondeRequestLineDraft";

export function validateRondeRequestLines(
  lines: LineDraft[],
  opts?: { requireValidityEndForIntervalWithoutWindow?: boolean; effectiveValidTo?: string }
): string | null {
  if (!lines.length) return "Ajoutez au moins une ligne de planification.";
  for (let i = 0; i < lines.length; i += 1) {
    const ln = lines[i];
    const label = `Ligne ${rondeRequestLineDisplayNumber(i, lines.length)}`;
    if (ln.roundKind !== "RANDOM" && !ln.requestedTime.trim()) {
      return `${label}: heure demandée obligatoire.`;
    }
    if (ln.roundKind !== "RANDOM") continue;
    if (hasPartialRandomWindow(ln) && !hasCompleteRandomWindow(ln)) {
      return `${label}: renseignez les 2 bornes de la fenêtre horaire.`;
    }
    if (
      opts?.requireValidityEndForIntervalWithoutWindow &&
      ln.intervalHours.trim() &&
      !hasCompleteRandomWindow(ln) &&
      !String(opts.effectiveValidTo ?? "").trim()
    ) {
      return `${label}: avec un intervalle sans fenêtre, renseignez une date de fin de validité.`;
    }
  }
  return null;
}
