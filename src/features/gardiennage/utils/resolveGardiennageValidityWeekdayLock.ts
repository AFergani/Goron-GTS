/**
 * Masque jours de semaine imposé par la plage de validité courte (≤ 7 jours).
 *
 * Bits alignés sur le calendrier gardiennage (`dayBitFromIsoDate`).
 */

import { dayBitFromIsoDate, isIsoDate, shiftIsoDate } from "../model/gardiennagePlanningCalendar";

/**
 * Masque pour une plage de validité courte (1–7 jours) en mode planification libre.
 * `null` = pas de verrouillage (UI libre / plage trop longue / bornes invalides).
 */
export function resolveGardiennageValidityWeekdayLock(opts: {
  validFrom: string;
  validTo: string;
}): number | null {
  const from = String(opts.validFrom || "").trim();
  const to = String(opts.validTo || "").trim();
  if (!isIsoDate(from) || !isIsoDate(to) || to < from) return null;

  let dayCount = 0;
  let cursor = from;
  while (cursor <= to && dayCount < 400) {
    dayCount += 1;
    cursor = shiftIsoDate(cursor, 1);
  }
  if (dayCount < 1 || dayCount > 7) return null;

  let mask = 0;
  cursor = from;
  while (cursor <= to) {
    mask |= dayBitFromIsoDate(cursor);
    cursor = shiftIsoDate(cursor, 1);
  }
  return mask > 0 ? mask : null;
}
