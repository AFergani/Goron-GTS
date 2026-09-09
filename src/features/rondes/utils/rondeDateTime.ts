/**
 * Helpers dates / heures partagés (vue journée, demande, page).
 */

import { addDaysIso } from "../model/rondePlannedSlotEngine";
import type { RondeEntry } from "../model/ronde.types";
import type { ApplicablePlannedSlot } from "../model/plannedSlots";

export { hhmmToMinutes, isRondeTimeHm, minutesToHm, normalizeRondeHmOr, RONDE_TIME_HM_RE } from "./rondeTime";

/** Liste inclusive des dates ISO entre deux bornes. */
export function enumerateInclusiveDateIsos(fromIso: string, toIso: string, maxDays = 5000): string[] {
  const from = String(fromIso || "").trim();
  const to = String(toIso || "").trim();
  if (!from || !to || to < from) return [];
  const out: string[] = [];
  let cursor = from;
  while (cursor <= to && out.length < maxDays) {
    out.push(cursor);
    cursor = addDaysIso(cursor, 1);
  }
  return out;
}

/**
 * Trouve la fiche planifiée correspondant à un créneau du jour.
 */
export function findPlannedEntryForSlot(
  entries: RondeEntry[],
  dateIso: string,
  slot: Pick<ApplicablePlannedSlot, "siteId" | "profileId" | "roundKind" | "slotKey">
): RondeEntry | undefined {
  return entries.find((e) => {
    if (e.source !== "PLANIFIE" || e.requestDate !== dateIso) return false;
    if (e.plannedProfileId !== slot.profileId) return false;
    if (slot.slotKey) {
      if (!e.plannedSlotKey) return false;
      return e.plannedSlotKey === slot.slotKey;
    }
    if (e.siteId !== slot.siteId) return false;
    if (e.plannedRoundKind !== slot.roundKind) return false;
    return !e.plannedSlotKey;
  });
}
