/**
 * Type de passage d’une fiche ronde (export Word, vue journée).
 */

import type { RondeEntry } from "../model/ronde.types";
import type { RondePlannedRoundKind } from "../model/rondePlanned.types";
import { formatPlannedRoundKindLabel } from "../model/plannedSlots";
import { extractRondeRequestedTimeHm } from "./rondePassageRules";

function minutesOfHm(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Heure dans la fenêtre, y compris si elle passe minuit. */
function hmFallsInWindow(hm: string, start: string, end: string): boolean {
  const time = minutesOfHm(hm);
  const from = minutesOfHm(start);
  const to = minutesOfHm(end);
  if (time == null || from == null || to == null) return false;
  if (from <= to) return time >= from && time <= to;
  return time >= from || time <= to;
}

const WORD_KIND_PREFIXES: ReadonlyArray<{ test: RegExp; lead: string }> = [
  { test: /^(aléatoire|aleatoire)/i, lead: "Ronde aléatoire" },
  { test: /^ouverture/i, lead: "Ronde d'ouverture" },
  { test: /^fermeture/i, lead: "Ronde de fermeture" },
  { test: /^accompagnement/i, lead: "Ronde d'accompagnement" }
];

/**
 * Type réellement connu de la fiche.
 * `null` si rien ne l’indique (pas de repli « Aléatoire »).
 */
export function resolveKnownRondePassageKind(entry: RondeEntry): string | null {
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
  const obsRaw = String(entry.horairesDemandeObs || "");
  const demanded = /Heure demandée:\s*((?:[01]\d|2[0-3]):[0-5]\d)/i.exec(obsRaw);
  const demandedHm = demanded?.[1] ?? "";
  if (demandedHm) {
    for (const line of snapshotLines) {
      if (line.roundKind !== "RANDOM") continue;
      if (hmFallsInWindow(demandedHm, line.randomWindowStart, line.randomWindowEnd)) {
        return formatPlannedRoundKindLabel("RANDOM");
      }
    }
  }
  const sharedKinds = [...new Set(snapshotLines.map((line) => line.roundKind).filter(Boolean))];
  if (sharedKinds.length === 1) {
    return formatPlannedRoundKindLabel(sharedKinds[0] as RondePlannedRoundKind);
  }
  const obs = obsRaw.toLowerCase();
  if (obs.includes("ouverture")) return "Ouverture";
  if (obs.includes("fermeture")) return "Fermeture";
  if (obs.includes("accompagnement")) return "Accompagnement";
  if (obs.includes("aléatoire") || obs.includes("aleatoire") || obs.includes("random")) return "Aléatoire";
  return null;
}

/**
 * Libellé du type de ronde de la fiche (Aléatoire, Ouverture, Fermeture, Accompagnement).
 * Repli « Aléatoire » quand le type n’est pas identifiable.
 */
export function rondePassageKindLabel(entry: RondeEntry): string {
  return resolveKnownRondePassageKind(entry) ?? "Aléatoire";
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
