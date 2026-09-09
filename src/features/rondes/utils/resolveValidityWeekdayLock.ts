/**
 * Masque jours de semaine imposé par la plage de validité (jour unique ou ≤ 7 jours).
 */

import {
  dateIsoToWeekdayMask,
  inclusiveCalendarDayCount,
  weekdaysMaskForInclusiveDateRange
} from "../model/rondePlannedSlotEngine";

/**
 * Masque pour une plage de validité courte (2–7 jours), hors mode jour unique.
 * `null` = pas de verrouillage (UI libre / plage trop longue).
 */
export function resolveValidityWeekdayLock(opts: {
  isSingleDay: boolean;
  validFrom: string;
  validTo: string;
}): number | null {
  if (opts.isSingleDay) return null;
  const from = opts.validFrom.trim();
  const to = opts.validTo.trim();
  if (!from || !to || to < from) return null;
  const dayCount = inclusiveCalendarDayCount(from, to);
  if (dayCount < 1 || dayCount > 7) return null;
  const mask = weekdaysMaskForInclusiveDateRange(from, to);
  return mask > 0 ? mask : null;
}

/** Masque effectif à appliquer aux lignes au submit (0 = inchangé côté lignes). */
export function resolveSubmitWeekdayMask(opts: {
  isSingleDay: boolean;
  validFrom: string;
  effectiveValidTo: string;
}): number {
  const from = opts.validFrom.trim();
  if (opts.isSingleDay && from) return dateIsoToWeekdayMask(from);
  return (
    resolveValidityWeekdayLock({
      isSingleDay: false,
      validFrom: from,
      validTo: opts.effectiveValidTo
    }) ?? 0
  );
}
