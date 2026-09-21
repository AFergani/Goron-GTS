/**
 * Détection de chevauchement entre lignes de planification gardiennage.
 *
 * Utilisé par `useGardiennagePlanningPreview` (modale de saisie).
 */

import {
  buildHolidayMatchers,
  collectActiveDatesForLine,
  isIsoDate,
  shiftIsoDate
} from "./gardiennagePlanningCalendar";
import { parseTimeToMin, type GardiennagePlanningFormMode } from "./gardiennagePlanningForm";
import type { GardiennagePlanningLineV1 } from "./gardiennage.types";

type OverlapParams = {
  planningMode: GardiennagePlanningFormMode;
  validFromDate: string;
  validToDate: string;
  planningLines: GardiennagePlanningLineV1[];
  holidayDateIsos: string[];
};

/**
 * Message d’erreur si deux lignes se recouvrent sur un même jour (continuité stricte autorisée).
 *
 * @param params.planningMode - Mode UI (le contrôle ne s’applique qu’en récurrent)
 * @param params.validFromDate - Début de validité
 * @param params.validToDate - Fin de validité
 * @param params.planningLines - Lignes saisies
 * @param params.holidayDateIsos - Jours fériés du référentiel
 * @returns Message utilisateur, ou chaîne vide si aucun chevauchement
 */
export function computeGardiennageLinesOverlapError(params: OverlapParams): string {
  const { planningMode, validFromDate, validToDate, planningLines, holidayDateIsos } = params;
  if (planningMode !== "recurring" || planningLines.length <= 1) return "";
  const holiday = buildHolidayMatchers(holidayDateIsos);
  const anchoredStartDates = new Set(
    planningLines
      .map((line) => (isIsoDate(line.anchorDate) ? line.anchorDate : ""))
      .filter((value) => Boolean(value))
  );
  const daySegments: Record<string, Array<{ start: number; end: number }>> = {};
  const pushDaySegment = (isoDate: string, segment: { start: number; end: number }) => {
    if (!daySegments[isoDate]) daySegments[isoDate] = [];
    daySegments[isoDate].push(segment);
  };
  for (const line of planningLines) {
    const start = parseTimeToMin(line.startTime);
    const end = parseTimeToMin(line.endTime);
    if (start < 0 || end < 0) continue;
    const activeDates = collectActiveDatesForLine(
      line,
      validFromDate,
      validToDate,
      anchoredStartDates,
      holiday
    );
    for (const activeDate of activeDates) {
      if (end > start) {
        pushDaySegment(activeDate, { start, end });
      } else if (end < start) {
        pushDaySegment(activeDate, { start, end: 24 * 60 });
        pushDaySegment(shiftIsoDate(activeDate, 1), { start: 0, end });
      } else {
        pushDaySegment(activeDate, { start: 0, end: 24 * 60 });
      }
    }
  }
  for (const isoDate of Object.keys(daySegments)) {
    const segments = daySegments[isoDate].sort((a, b) => a.start - b.start);
    for (let i = 1; i < segments.length; i += 1) {
      const prev = segments[i - 1];
      const current = segments[i];
      if (current.start < prev.end) {
        return "Chevauchement détecté entre lignes de planification. Ajustez les horaires.";
      }
    }
  }
  return "";
}
