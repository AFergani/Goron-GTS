/**
 * Photo de la demande pour l’export Word `{resume_demande}`.
 *
 * Phrase lisible (origine, types de ronde, rythme, jours, période).
 * La consigne écrite a son propre jeton `{consigne}`. La date de demande n’est pas reprise.
 */

import { formatDateShortFr } from "../../common/utils/formatDateShortFr";
import type { RondeEntry } from "../model/ronde.types";
import {
  requestOriginFromStoredEntry,
  stripSuiteInterventionPrefix
} from "../model/requestOrigin";
import type { RondePlannedProfileRef } from "../model/rondePlanned.types";
import {
  lineRefToDraft,
  parseDraftIntervalMinutes,
  parseDraftRoundsCount,
  planningSnapshotLineToDraft,
  type LineDraft
} from "../model/rondeRequestLineDraft";
import {
  formatRondeIntervalProse,
  formatRondeWeekdaysLes
} from "../model/rondePlannedSummary";
import { isRondeTimeHm } from "./rondeTime";

function formatOriginProse(entry: RondeEntry): string {
  const origin = requestOriginFromStoredEntry(entry);
  if (origin === "APPEL_CLIENT") {
    const name = String(entry.originDetail || "").trim();
    return name ? `Demande de ${name}` : "Demande client";
  }
  if (origin === "SUITE_INTERVENTION") return "Suite d'intervention";
  if (origin === "CONTRAT") return "Demande contractuelle";
  return "Demande";
}

function formatResumeLinePhrase(line: LineDraft, omitWeekdays: boolean): string {
  if (!line.roundKind) return "";
  let head =
    line.roundKind === "OPENING"
      ? "ronde d'ouverture"
      : line.roundKind === "CLOSING"
        ? "ronde de fermeture"
        : line.roundKind === "ACCOMPAGNEMENT"
          ? "ronde d'accompagnement"
          : "ronde aléatoire";
  if (
    line.roundKind === "OPENING" ||
    line.roundKind === "CLOSING" ||
    line.roundKind === "ACCOMPAGNEMENT"
  ) {
    const time = line.requestedTime.trim();
    if (time) head = `${head} à ${time}`;
  }

  const bits: string[] = [head];
  const intervalMinutes = parseDraftIntervalMinutes(line);
  if (intervalMinutes) {
    const interval = formatRondeIntervalProse(intervalMinutes);
    if (interval) bits.push(interval);
  }
  const windowStart = line.randomWindowStart.trim();
  const windowEnd = line.randomWindowEnd.trim();
  if (line.roundKind === "RANDOM" && windowStart && windowEnd) {
    bits.push(`entre ${windowStart} et ${windowEnd}`);
  }
  const roundsCount = parseDraftRoundsCount(line);
  if (line.roundKind === "RANDOM" && !intervalMinutes && roundsCount && roundsCount >= 1) {
    bits.push(roundsCount === 1 ? "un passage" : `${roundsCount} passages`);
  }
  if (!omitWeekdays && line.weekdaysMask) {
    const days = formatRondeWeekdaysLes(line.weekdaysMask);
    if (days) bits.push(days);
  }
  return bits.join(" ");
}

function formatValiditySpan(
  validFrom: string,
  validFromTime: string,
  validTo: string,
  validToTime: string,
  isSingleDay: boolean
): string {
  const from = validFrom.trim();
  if (!from) return "";
  const fromFr = formatDateShortFr(from) || "—";
  const fromHm = isRondeTimeHm(validFromTime.trim()) ? ` ${validFromTime.trim()}` : "";
  if (isSingleDay) {
    return `le ${fromFr}${fromHm}`;
  }
  const toIso = validTo.trim();
  if (!toIso) {
    return `à partir du ${fromFr}${fromHm}`;
  }
  const toFr = formatDateShortFr(toIso) || "—";
  const toHm = isRondeTimeHm(validToTime.trim()) ? ` ${validToTime.trim()}` : "";
  return `du ${fromFr}${fromHm} au ${toFr}${toHm}`;
}

/** Photo courte d'une demande de ronde (lignes + validité). */
export function formatRondeRequestFlux(input: {
  validFrom: string;
  validFromTime: string;
  validTo: string;
  validToTime: string;
  isSingleDay: boolean;
  lines: LineDraft[];
}): string {
  const span = formatValiditySpan(
    input.validFrom,
    input.validFromTime,
    input.validTo,
    input.validToTime,
    input.isSingleDay
  );
  const phrases = input.lines.map((line) => formatResumeLinePhrase(line, false)).filter(Boolean);
  return [phrases.join(" ; "), span].filter(Boolean).join(", ");
}

function formatResumeDemandeProse(
  entry: RondeEntry,
  lines: LineDraft[],
  omitWeekdays: boolean,
  validitySpan: string
): string {
  const origin = formatOriginProse(entry);
  const phrases = lines.map((line) => formatResumeLinePhrase(line, omitWeekdays)).filter(Boolean);
  const body = phrases.join(" ; ");
  let sentence = body ? `${origin} : ${body}` : origin;
  if (validitySpan) sentence = body ? `${sentence}, ${validitySpan}` : `${sentence} ${validitySpan}`;
  const trimmed = sentence.trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function formatConsignePart(entry: RondeEntry, profile?: RondePlannedProfileRef | null): string {
  const snapConsigne = String(entry.requestPlanningSnapshot?.consigne || "").trim();
  if (snapConsigne) return snapConsigne;
  const notes = String(profile?.notes || "").trim();
  if (notes) return notes;
  const origin = requestOriginFromStoredEntry(entry);
  if (origin === "APPEL_CLIENT") return "";
  const detail = stripSuiteInterventionPrefix(entry.originDetail || "");
  if (detail && detail.toLowerCase() !== "planifiée") return detail;
  return "";
}

function resolveProfile(entry: RondeEntry, profiles?: RondePlannedProfileRef[] | null): RondePlannedProfileRef | null {
  if (!entry.plannedProfileId || !profiles?.length) return null;
  return profiles.find((item) => item.id === entry.plannedProfileId) || null;
}

/**
 * Consigne écrite seule (notes du profil contractuel, ou consigne de la demande exceptionnelle).
 */
export function formatRondeConsigne(
  entry: RondeEntry,
  options?: { profiles?: RondePlannedProfileRef[] | null }
): string {
  return formatConsignePart(entry, resolveProfile(entry, options?.profiles));
}

/**
 * Construit le texte `{resume_demande}` d’une fiche.
 *
 * @param entry - Fiche ronde
 * @param options.profiles - Profils (consigne et lignes contractuelles)
 */
export function formatRondeResumeDemande(
  entry: RondeEntry,
  options?: { profiles?: RondePlannedProfileRef[] | null; holidayDateIsos?: string[] }
): string {
  const snap = entry.requestPlanningSnapshot;
  const profile = resolveProfile(entry, options?.profiles);

  /* Contractuel : toutes les lignes du profil (pas seulement le créneau de la fiche). */
  if (profile?.lines?.length) {
    const lines = profile.lines.map((line) => lineRefToDraft(line));
    const from = String(profile.planningValidFrom || entry.requestDate || "").trim();
    const to = String(profile.planningValidTo || "").trim();
    const isSingleDay = Boolean(from && to && from === to);
    const validitySpan = formatValiditySpan(from, "", to, "", isSingleDay);
    return formatResumeDemandeProse(entry, lines, isSingleDay, validitySpan);
  }

  if (snap?.lines?.length) {
    const lines = snap.lines.map((line, index) => planningSnapshotLineToDraft(line, `resume-${index}`));
    const isSingleDay = Boolean(snap.isSingleDay);
    const validitySpan = formatValiditySpan(
      snap.validFrom || String(snap.requestDate || entry.requestDate || "").trim(),
      String(snap.validFromTime || "").trim(),
      snap.validTo || "",
      String(snap.validToTime || "").trim() || "23:59",
      isSingleDay
    );
    return formatResumeDemandeProse(entry, lines, isSingleDay, validitySpan);
  }

  return formatOriginProse(entry);
}
