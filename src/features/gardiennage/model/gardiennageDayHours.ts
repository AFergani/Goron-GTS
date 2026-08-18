/**
 * Découpage des horaires gardiennage sur un jour calendaire (affichage « journée »).
 *
 * Une prestation multi-jours est stockée comme un intervalle continu (ex. 15/08 15:30 → 17/08 06:30).
 * La vue jour affiche la portion de cet intervalle qui tombe sur la date sélectionnée :
 * 15/08 15:30–23:59, 16/08 00:00–23:59, 17/08 00:00–06:30.
 *
 * Utilisé par : `GardiennagePage` (filtre du jour), `GardiennageTable` (colonne Horaires).
 */

import type { GardiennageEntry } from "./gardiennage.types";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Portion d'un créneau visible sur une date donnée. */
export type GardiennageDayHours = {
  startTime: string;
  endTime: string;
};

/**
 * Décale une date ISO locale de `amount` jours (calendrier poste, sans UTC).
 *
 * @param isoDate - Date `YYYY-MM-DD`
 * @param amount - Nombre de jours (négatif = recul)
 * @returns Date ISO locale, ou chaîne vide si l'entrée est invalide
 */
function shiftLocalIsoDate(isoDate: string, amount: number): string {
  if (!ISO_DATE_RE.test(isoDate)) return "";
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + amount);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Normalise un datetime ISO applicatif en `YYYY-MM-DDTHH:mm:00`.
 *
 * @param raw - Valeur persistée (`planning_slot_*` ou reconstruction)
 * @returns Datetime comparable, ou chaîne vide
 */
function normalizeDateTimeIso(raw: string): string {
  const match = String(raw || "").trim().match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?/);
  return match ? `${match[1]}T${match[2]}:00` : "";
}

/**
 * Indique une couverture H24 jusqu'à nouvel ordre (pas de fin métier).
 *
 * @param entry - Ligne gardiennage
 * @returns `true` si snapshot ouvert et continu
 */
function isOpenEndedContinuous(entry: GardiennageEntry): boolean {
  return Boolean(entry.planningSnapshot?.isOpenEnded && entry.planningSnapshot?.isContinuous);
}

/**
 * Borne de début / fin du créneau stocké (`planning_slot_*`, sinon dates + heures).
 *
 * @param entry - Ligne gardiennage
 * @returns Intervalle `[startIso, endIso]` ; `endIso` vide = ouvert (H24 sans date de fin)
 */
function resolveSlotRange(entry: GardiennageEntry): { startIso: string; endIso: string } | null {
  const slotStart = normalizeDateTimeIso(String(entry.planningSlotStart || ""));
  const slotEnd = normalizeDateTimeIso(String(entry.planningSlotEnd || ""));
  if (slotStart && (isOpenEndedContinuous(entry) || (slotEnd && slotStart < slotEnd))) {
    return { startIso: slotStart, endIso: isOpenEndedContinuous(entry) ? "" : slotEnd };
  }

  const startDate = String(entry.recurrenceStartDate || "").trim();
  const startTime = String(entry.startTime || "").trim();
  if (!ISO_DATE_RE.test(startDate) || !TIME_RE.test(startTime)) return null;
  const startIso = `${startDate}T${startTime}:00`;
  if (isOpenEndedContinuous(entry)) return { startIso, endIso: "" };

  const endTime = String(entry.endTime || "").trim();
  if (!TIME_RE.test(endTime)) return null;
  let endDate = String(entry.recurrenceEndDate || "").trim();
  if (!ISO_DATE_RE.test(endDate)) {
    endDate = entry.crossesMidnight ? shiftLocalIsoDate(startDate, 1) : startDate;
  }
  let endIso = `${endDate}T${endTime}:00`;
  if (startIso >= endIso && entry.crossesMidnight) {
    const nextDay = shiftLocalIsoDate(startDate, 1);
    endIso = nextDay ? `${nextDay}T${endTime}:00` : endIso;
  }
  if (startIso >= endIso) return null;
  return { startIso, endIso };
}

/**
 * Calcule les horaires à afficher pour `dateIso` (clip 00:00–23:59 sur ce jour).
 *
 * Une fin pile à minuit du lendemain s'affiche `23:59` (pas d'heure 24:00).
 *
 * @param entry - Ligne gardiennage
 * @param dateIso - Jour calendaire `YYYY-MM-DD`
 * @returns Horaires du jour, ou `null` si le créneau ne couvre pas cette date
 */
export function clipGardiennageHoursToDay(
  entry: GardiennageEntry,
  dateIso: string
): GardiennageDayHours | null {
  if (!ISO_DATE_RE.test(dateIso)) return null;
  const range = resolveSlotRange(entry);
  if (!range) return null;
  const dayStart = `${dateIso}T00:00:00`;
  const nextDate = shiftLocalIsoDate(dateIso, 1);
  if (!nextDate) return null;
  const dayEndExclusive = `${nextDate}T00:00:00`;
  if (range.startIso >= dayEndExclusive) return null;
  if (range.endIso && range.endIso <= dayStart) return null;
  const clipStart = range.startIso > dayStart ? range.startIso : dayStart;
  const clipEnd = range.endIso && range.endIso < dayEndExclusive ? range.endIso : dayEndExclusive;
  if (clipStart >= clipEnd) return null;
  return {
    startTime: clipStart.slice(11, 16),
    endTime: clipEnd === dayEndExclusive ? "23:59" : clipEnd.slice(11, 16)
  };
}

/**
 * Libellé `HH:mm → HH:mm` pour la vue journée.
 *
 * @param hours - Portion calculée par `clipGardiennageHoursToDay`
 * @returns Texte d'affichage
 */
export function formatGardiennageDayHours(hours: GardiennageDayHours): string {
  return `${hours.startTime} → ${hours.endTime}`;
}
