/**
 * Règles de clôture gardiennage (côté UI, alignées sur le backend `helpers.js`).
 *
 * H24 avec fin : clôture de toute la prestation après l'heure de fin, auto à J+3.
 * H24 ouvert : pas de clôture (manuelle ni auto) tant qu'une date de fin n'est pas enregistrée.
 * Nuit récurrente : clôture de cette fiche après sa fin, auto à J+3.
 *
 * Utilisé par : `GardiennageTable`, `GardiennageEntryModal`.
 */

import type { GardiennageEntry } from "./gardiennage.types";
import type { GardiennageGeneratedSlot } from "./gardiennagePlannerEngine";

/**
 * Indique une couverture H24 jusqu'à nouvel ordre.
 *
 * @param entry - Ligne gardiennage
 * @returns `true` si snapshot ouvert et continu
 */
export function isOpenEndedContinuousGardiennage(entry: GardiennageEntry): boolean {
  return Boolean(entry.planningSnapshot?.isOpenEnded && entry.planningSnapshot?.isContinuous);
}

/**
 * Instant de fin du créneau (ms).
 *
 * @param entry - Ligne gardiennage
 * @returns Timestamp, ou `null`
 */
export function resolveGardiennageSlotEndMs(entry: GardiennageEntry): number | null {
  const slotEnd = String(entry.planningSlotEnd || "").trim();
  if (slotEnd) {
    const timestamp = new Date(slotEnd.length === 16 ? `${slotEnd}:00` : slotEnd).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
  }
  const startDate = String(entry.recurrenceStartDate || "").trim();
  const endTime = String(entry.endTime || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !endTime) return null;
  const endDate = entry.crossesMidnight
    ? shiftLocalDate(startDate, 1)
    : (String(entry.recurrenceEndDate || "").trim() || startDate);
  if (!endDate) return null;
  const timestamp = new Date(`${endDate}T${endTime}:00`).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

/**
 * @param isoDate - `YYYY-MM-DD`
 * @param amount - Jours
 * @returns Date locale ISO
 */
function shiftLocalDate(isoDate: string, amount: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + amount);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Clôture manuelle autorisée après la fin prévue. H24 jusqu'à nouvel ordre : d'abord poser une date de fin.
 *
 * @param entry - Ligne gardiennage
 * @param nowMs - Horloge (tests)
 * @returns `true` si le bouton clôturer peut agir
 */
export function canManuallyCloseGardiennage(entry: GardiennageEntry, nowMs: number = Date.now()): boolean {
  if (entry.status === "CLOTURE" || entry.status === "ANNULE") return false;
  if (isOpenEndedContinuousGardiennage(entry)) return false;
  const endMs = resolveGardiennageSlotEndMs(entry);
  if (endMs == null) return false;
  return nowMs >= endMs;
}

/**
 * Libellé d'indisponibilité de la clôture.
 *
 * @param entry - Ligne gardiennage
 * @returns Phrase française, ou chaîne vide si clôturable
 */
export function gardiennageCloseBlockedLabel(entry: GardiennageEntry): string {
  if (canManuallyCloseGardiennage(entry)) return "";
  if (isOpenEndedContinuousGardiennage(entry)) {
    return "Indiquez une date de fin dans la demande, enregistrez, puis clôturez après cette fin.";
  }
  const endMs = resolveGardiennageSlotEndMs(entry);
  if (endMs == null) return "La clôture n'est pas encore possible.";
  const label = new Date(endMs).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  return `Clôture possible après la fin prévue (${label}).`;
}

/**
 * Normalise un datetime de slot pour comparaison (`YYYY-MM-DDTHH:mm`).
 *
 * @param raw - ISO applicatif
 * @returns Clé comparable
 */
function slotStartKey(raw: string): string {
  const match = String(raw || "").trim().match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return match ? `${match[1]}T${match[2]}` : "";
}

/**
 * Indique si un créneau de prévisualisation a déjà une fiche clôturée dans le lot.
 *
 * @param slot - Créneau généré
 * @param batchEntries - Lignes du même `planningBatchId`
 * @returns `true` si une fiche CLOTURE correspond
 */
export function isGardiennagePreviewSlotClosed(
  slot: GardiennageGeneratedSlot,
  batchEntries: GardiennageEntry[]
): boolean {
  const slotKey = slotStartKey(slot.startIso);
  return batchEntries.some((row) => {
    if (row.status !== "CLOTURE") return false;
    const storedKey = slotStartKey(String(row.planningSlotStart || ""));
    if (slotKey && storedKey) return slotKey === storedKey;
    return row.recurrenceStartDate === slot.startDate
      && row.startTime === slot.startTime
      && row.endTime === slot.endTime;
  });
}
