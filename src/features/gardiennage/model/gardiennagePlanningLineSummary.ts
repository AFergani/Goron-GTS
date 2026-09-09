/**
 * Libellé récapitulatif d’une ligne de planification gardiennage (aperçu modale).
 */

import { formatDateShortFr } from "../../common/utils/formatDateShortFr";
import type { GardiennagePlanningLineV1 } from "./gardiennage.types";
import {
  GARDIENNAGE_WEEKDAY_BITS,
  GARDIENNAGE_WEEKDAYS_ALL_MASK,
  isIsoDate
} from "./gardiennagePlanningCalendar";

/**
 * Résumé lisible d’une ligne (jours / fériés / horaires ou date ancrée).
 *
 * @param line - Ligne de planning
 * @param options.omitWeekdayRecurrence - Masque L–D si la validité courte le décrit déjà
 */
export function formatGardiennagePlanningLineSummary(
  line: GardiennagePlanningLineV1,
  options?: { omitWeekdayRecurrence?: boolean }
): string {
  const start = String(line.startTime || "").trim() || "—";
  const end = String(line.endTime || "").trim() || "—";
  const timePart = `${start}–${end}`;

  if (isIsoDate(line.anchorDate)) {
    return `${formatDateShortFr(line.anchorDate) || line.anchorDate} · ${timePart}`;
  }

  const parts: string[] = [];
  if (!options?.omitWeekdayRecurrence) {
    const mask = Number(line.weekdaysMask ?? 0);
    if (mask <= 0 || mask === GARDIENNAGE_WEEKDAYS_ALL_MASK) {
      parts.push("chaque jour");
    } else {
      const days = GARDIENNAGE_WEEKDAY_BITS.filter((d) => (mask & d.bit) !== 0).map((d) => d.label);
      parts.push(days.length ? `hebdo ${days.join(", ")}` : "hebdo —");
    }
  }
  if (line.includeHolidayEves) parts.push("veilles JF");
  if (line.includeHolidays) parts.push("JF");
  parts.push(timePart);
  return parts.join(" · ");
}
