/**
 * Masque jours suggéré par une plage de validité courte (2–7 jours).
 * Sert de valeur initiale pour une nouvelle ligne. Les toggles restent modifiables.
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
  /* Jour unique : géré par `isSingleDay`, pas par ce verrou (sinon Du = Au fige l’UI). */
  if (dayCount < 2 || dayCount > 7) return null;
  const mask = weekdaysMaskForInclusiveDateRange(from, to);
  return mask > 0 ? mask : null;
}

/**
 * Masque imposé au submit.
 * Jour unique : le jour de la date de début.
 * Sinon 0 : les toggles saisis sont conservés (0 = tous les jours de la plage).
 */
export function resolveSubmitWeekdayMask(opts: {
  isSingleDay: boolean;
  validFrom: string;
  effectiveValidTo: string;
}): number {
  const from = opts.validFrom.trim();
  if (opts.isSingleDay && from) return dateIsoToWeekdayMask(from);
  return 0;
}
