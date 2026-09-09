/**
 * Helpers d’édition des lignes de planification gardiennage (ordre UI / libellés).
 *
 * Aligné sur la demande ronde : stockage « plus récent en premier », numérotation
 * chronologique affichée (1re saisie = Ligne 1).
 */

import type { GardiennagePlanningLineV1 } from "../model/gardiennage.types";

/**
 * Numéro affiché quand le tableau stocke la ligne la plus récente en premier.
 * Ex. `[nouvelle, ancienne]` → Ligne 2, Ligne 1.
 */
export function gardiennagePlanningLineDisplayNumber(indexFromNewest: number, lineCount: number): number {
  return Math.max(1, lineCount - indexFromNewest);
}

/** Resynchronise `label` avec la numérotation chronologique (newest-first). */
export function syncGardiennagePlanningLineLabels(
  lines: GardiennagePlanningLineV1[]
): GardiennagePlanningLineV1[] {
  const count = lines.length;
  let changed = false;
  const next = lines.map((line, index) => {
    const label = `Ligne ${gardiennagePlanningLineDisplayNumber(index, count)}`;
    if (line.label === label) return line;
    changed = true;
    return { ...line, label };
  });
  return changed ? next : lines;
}

/**
 * Normalise un snapshot historique (append : Ligne 1 en tête) vers l’ordre UI newest-first.
 * Si déjà newest-first (ou une seule ligne), renvoie la même référence.
 */
export function normalizeGardiennagePlanningLinesNewestFirst(
  lines: GardiennagePlanningLineV1[]
): GardiennagePlanningLineV1[] {
  if (lines.length <= 1) return lines;
  const firstLabel = String(lines[0]?.label || "").trim();
  const lastLabel = String(lines[lines.length - 1]?.label || "").trim();
  if (firstLabel === "Ligne 1" && lastLabel !== "Ligne 1") {
    return syncGardiennagePlanningLineLabels([...lines].reverse());
  }
  return lines;
}
