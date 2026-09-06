/**
 * Brouillon de ligne de planification (modale demande).
 */

import type { HolidayRef } from "../../../types";
import { RANDOM_PERIOD_DAY, RANDOM_PERIOD_NIGHT, type RondePlannedProfileLineRef } from "./rondePlanned.types";
import { addDaysIso, dateIsoToWeekdayMask } from "./rondePlannedSlotEngine";
import { formatRondePlannedLineSummary } from "./rondePlannedSummary";

export type RoundKindDraft = "OPENING" | "CLOSING" | "ACCOMPAGNEMENT" | "RANDOM";

export type LineDraft = {
  id: string;
  roundKind: RoundKindDraft;
  requestedTime: string;
  randomWindowStart: string;
  randomWindowEnd: string;
  randomRoundsCount: string;
  intervalHours: string;
  intervalEndTime: string;
  weekdaysMask: number;
  includeHolidays: boolean;
  includeHolidayEves: boolean;
};

export function lineRefToDraft(line: RondePlannedProfileLineRef): LineDraft {
  const rk: RoundKindDraft =
    line.roundKind === "OPENING" ||
    line.roundKind === "CLOSING" ||
    line.roundKind === "ACCOMPAGNEMENT" ||
    line.roundKind === "RANDOM"
      ? line.roundKind
      : "RANDOM";
  return {
    id: line.id,
    roundKind: rk,
    requestedTime: line.requestedTime ?? "",
    randomWindowStart: line.randomWindowStart ?? "",
    randomWindowEnd: line.randomWindowEnd ?? "",
    randomRoundsCount: line.randomRoundsCount != null ? String(line.randomRoundsCount) : "",
    intervalHours: line.intervalMinutes != null ? String(line.intervalMinutes / 60) : "",
    intervalEndTime: "23:59",
    weekdaysMask: line.weekdaysMask,
    includeHolidays: Boolean(line.includeHolidays),
    includeHolidayEves: Boolean(line.includeHolidayEves)
  };
}

/** Résumé lisible d'une ligne brouillon (aperçu / récap demande). */
export function formatLineDraftSummary(
  line: LineDraft,
  opts?: { omitWeekdayRecurrence?: boolean }
): string {
  const intervalMinutes = line.intervalHours.trim()
    ? Math.max(1, Math.round(Number(line.intervalHours) * 60))
    : null;
  const roundsCount = line.randomRoundsCount.trim()
    ? Math.max(1, Math.round(Number(line.randomRoundsCount)))
    : null;
  const omitWeekdayRecurrence = Boolean(opts?.omitWeekdayRecurrence);
  const recurrenceKind = omitWeekdayRecurrence || !line.weekdaysMask ? "DAILY" : "WEEKLY";
  return formatRondePlannedLineSummary(
    {
      roundKind: line.roundKind,
      recurrenceKind,
      weekdaysMask: line.weekdaysMask,
      monthDay: null,
      requestedTime: line.requestedTime.trim() || null,
      intervalMinutes: Number.isFinite(intervalMinutes as number) ? intervalMinutes : null,
      randomPeriodMask: RANDOM_PERIOD_DAY | RANDOM_PERIOD_NIGHT,
      randomWindowStart: line.randomWindowStart.trim() || null,
      randomWindowEnd: line.randomWindowEnd.trim() || null,
      randomRoundsCount: Number.isFinite(roundsCount as number) ? roundsCount : null
    },
    { omitRecurrence: omitWeekdayRecurrence }
  );
}

export function isWeekdayEnabled(weekdaysMask: number, dateIso: string): boolean {
  if (!Number.isFinite(Number(weekdaysMask)) || Number(weekdaysMask) <= 0) return true;
  return (Number(weekdaysMask) & dateIsoToWeekdayMask(dateIso)) !== 0;
}

export function holidayMatchers(holidays: HolidayRef[] | undefined) {
  const set = new Set((holidays || []).map((h) => String(h.dateIso || "").trim()).filter(Boolean));
  return {
    isHoliday: (iso: string) => set.has(String(iso || "").trim()),
    isHolidayEve: (iso: string) => set.has(addDaysIso(String(iso || "").trim(), 1))
  };
}
