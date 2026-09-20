/**
 * Type de passage d’une fiche ronde (export Word, vue journée).
 */

import type { RondeEntry } from "../model/ronde.types";
import type { RondePlannedRoundKind } from "../model/rondePlanned.types";
import { formatPlannedRoundKindLabel } from "../model/plannedSlots";
import { extractRondeRequestedTimeHm } from "./rondePassageRules";

const WORD_KIND_PREFIXES: ReadonlyArray<{ test: RegExp; lead: string }> = [
  { test: /^(aléatoire|aleatoire)/i, lead: "Ronde aléatoire" },
  { test: /^ouverture/i, lead: "Ronde d'ouverture" },
  { test: /^fermeture/i, lead: "Ronde de fermeture" },
  { test: /^accompagnement/i, lead: "Ronde d'accompagnement" }
];

/**
 * Libellé du type de ronde de la fiche (Aléatoire, Ouverture, Fermeture, Accompagnement).
 */
export function rondePassageKindLabel(entry: RondeEntry): string {
  if (entry.plannedRoundKind) {
    return formatPlannedRoundKindLabel(entry.plannedRoundKind as RondePlannedRoundKind);
  }
  const snapshotLines = entry.requestPlanningSnapshot?.lines ?? [];
  const requestedTime = extractRondeRequestedTimeHm(entry);
  for (const line of snapshotLines) {
    const t = String(line.requestedTime || "").trim();
    if (t && t === requestedTime && line.roundKind) {
      return formatPlannedRoundKindLabel(line.roundKind as RondePlannedRoundKind);
    }
  }
  if (snapshotLines.length === 1 && snapshotLines[0]?.roundKind) {
    return formatPlannedRoundKindLabel(snapshotLines[0].roundKind as RondePlannedRoundKind);
  }
  const obs = String(entry.horairesDemandeObs || "").toLowerCase();
  if (obs.includes("ouverture")) return "Ouverture";
  if (obs.includes("fermeture")) return "Fermeture";
  if (obs.includes("accompagnement")) return "Accompagnement";
  if (obs.includes("aléatoire") || obs.includes("aleatoire") || obs.includes("random")) return "Aléatoire";
  return "Aléatoire";
}

/**
 * Libellé Word `{type_passage}` : « Ronde » devant le type.
 * Ex. Ronde aléatoire, Ronde d'ouverture, Ronde de fermeture, Ronde d'accompagnement.
 */
export function rondePassageKindWordLabel(entry: RondeEntry): string {
  const raw = rondePassageKindLabel(entry).trim();
  if (!raw) return "";
  if (/^ronde\s/i.test(raw)) return raw;
  for (const rule of WORD_KIND_PREFIXES) {
    const match = raw.match(rule.test);
    if (match) return `${rule.lead}${raw.slice(match[0].length)}`;
  }
  return `Ronde ${raw}`;
}
