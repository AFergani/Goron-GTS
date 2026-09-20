/**
 * Convertit les lignes brouillon de demande en payload profil planifié.
 */

import { RANDOM_PERIOD_DAY, RANDOM_PERIOD_NIGHT, type RondePlannedProfileLinePayload } from "../model/rondePlanned.types";
import {
  hasCompleteRandomWindow,
  isChosenRoundKindDraft,
  parseDraftIntervalMinutes,
  parseDraftRoundsCount,
  type LineDraft
} from "../model/rondeRequestLineDraft";

export function buildRondeProfileLinesFromDrafts(
  lines: LineDraft[],
  motifTypeId: string
): RondePlannedProfileLinePayload[] {
  return lines.flatMap((ln) => {
    if (!isChosenRoundKindDraft(ln.roundKind)) return [];
    const intervalMinutes = parseDraftIntervalMinutes(ln);
    const roundsCount = parseDraftRoundsCount(ln);
    const hasWindow = hasCompleteRandomWindow(ln);
    return [{
      ...(ln.id ? { id: ln.id } : {}),
      roundKind: ln.roundKind,
      recurrenceKind: "WEEKLY",
      weekdaysMask: ln.weekdaysMask,
      monthDay: null,
      requestedTime: ln.roundKind === "RANDOM" ? "" : ln.requestedTime.trim(),
      intervalMinutes,
      motifTypeId: ln.roundKind === "RANDOM" ? motifTypeId : null,
      randomPeriodMask: RANDOM_PERIOD_DAY | RANDOM_PERIOD_NIGHT,
      randomWindowStart: ln.roundKind === "RANDOM" && hasWindow ? ln.randomWindowStart.trim() : "",
      randomWindowEnd: ln.roundKind === "RANDOM" && hasWindow ? ln.randomWindowEnd.trim() : "",
      randomRoundsCount: ln.roundKind === "RANDOM" && !intervalMinutes ? roundsCount : null,
      includeHolidays: Boolean(ln.includeHolidays),
      includeHolidayEves: Boolean(ln.includeHolidayEves),
      rangeStartDate: null,
      rangeEndDate: null
    }];
  });
}
