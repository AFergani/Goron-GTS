/**
 * Génère les passages exceptionnels prévus à partir des lignes brouillon + validité.
 */

import {
  generateRandomSlotSpecs
} from "../model/rondePlannedSlotEngine";
import { RANDOM_PERIOD_DAY, RANDOM_PERIOD_NIGHT, type RondePlannedProfileLineRef } from "../model/rondePlanned.types";
import {
  hasCompleteRandomWindow,
  isWeekdayEnabled,
  parseDraftIntervalMinutes,
  parseDraftRoundsCount,
  type LineDraft
} from "../model/rondeRequestLineDraft";
import { buildIntervalTimesAcrossValidity } from "./buildIntervalTimesAcrossValidity";
import { enumerateInclusiveDateIsos, hhmmToMinutes, minutesToHm, normalizeRondeHmOr } from "./rondeDateTime";
import { parseDateTimeSafeMs } from "./parseDateTimeSafeMs";

export type ExceptionalGeneratedItem = {
  requestDate: string;
  requestedTime: string;
  lineIndex: number;
};

export type ExceptionalGeneratedResult = {
  items: ExceptionalGeneratedItem[];
  perLine: number[];
};

function lineAppliesOnDate(
  line: LineDraft,
  dateIso: string,
  holidayMatch: { isHoliday: (iso: string) => boolean; isHolidayEve: (iso: string) => boolean }
): boolean {
  if (isWeekdayEnabled(line.weekdaysMask, dateIso)) return true;
  if (line.includeHolidays && holidayMatch.isHoliday(dateIso)) return true;
  if (line.includeHolidayEves && holidayMatch.isHolidayEve(dateIso)) return true;
  return false;
}

export function buildExceptionalGeneratedItems(params: {
  lines: LineDraft[];
  validFrom: string;
  validTo: string;
  validFromTime: string;
  validToTime: string;
  requestDate: string;
  requestTime: string;
  motifTypeId: string;
  holidayMatch: { isHoliday: (iso: string) => boolean; isHolidayEve: (iso: string) => boolean };
}): ExceptionalGeneratedResult {
  const rangeEndIso = params.validTo.trim() || params.validFrom.trim();
  const safeFrom = params.validFrom.trim();
  if (!safeFrom || !rangeEndIso || rangeEndIso < safeFrom) {
    return { items: [], perLine: params.lines.map(() => 0) };
  }
  const fromTimeNorm = normalizeRondeHmOr(params.validFromTime, "00:00");
  const toTimeNorm = normalizeRondeHmOr(params.validToTime, "23:59");
  const validityStartMs = parseDateTimeSafeMs(safeFrom, fromTimeNorm);
  const validityEndMs = parseDateTimeSafeMs(rangeEndIso, toTimeNorm);
  if (validityStartMs == null || validityEndMs == null || validityEndMs < validityStartMs) {
    return { items: [], perLine: params.lines.map(() => 0) };
  }
  const dateAnchors = enumerateInclusiveDateIsos(safeFrom, rangeEndIso);
  const items: ExceptionalGeneratedItem[] = [];
  const perLine = params.lines.map(() => 0);
  const pushIfInValidity = (requestDateIso: string, requestedTimeHm: string, lineIndex: number) => {
    const timeNorm = normalizeRondeHmOr(requestedTimeHm, "00:00");
    const ms = parseDateTimeSafeMs(requestDateIso, timeNorm);
    if (ms == null || ms < validityStartMs || ms > validityEndMs) return;
    items.push({ requestDate: requestDateIso, requestedTime: requestedTimeHm, lineIndex });
    perLine[lineIndex] += 1;
  };

  for (let lineIndex = 0; lineIndex < params.lines.length; lineIndex += 1) {
    const ln = params.lines[lineIndex];
    if (ln.roundKind !== "RANDOM") {
      for (const dayIso of dateAnchors) {
        if (!lineAppliesOnDate(ln, dayIso, params.holidayMatch)) continue;
        pushIfInValidity(dayIso, ln.requestedTime.trim(), lineIndex);
      }
      continue;
    }

    const intervalMinutes = parseDraftIntervalMinutes(ln);
    const roundsCount = parseDraftRoundsCount(ln);
    const hasCompleteWindow = hasCompleteRandomWindow(ln);

    if (hasCompleteWindow) {
      const lineRef: RondePlannedProfileLineRef = {
        id: ln.id,
        profileId: "__request__",
        sortOrder: lineIndex,
        roundKind: "RANDOM",
        recurrenceKind: "WEEKLY",
        weekdaysMask: ln.weekdaysMask,
        monthDay: null,
        requestedTime: null,
        intervalMinutes,
        randomPeriodMask: RANDOM_PERIOD_DAY | RANDOM_PERIOD_NIGHT,
        randomWindowStart: ln.randomWindowStart.trim(),
        randomWindowEnd: ln.randomWindowEnd.trim(),
        randomRoundsCount: roundsCount,
        includeHolidays: Boolean(ln.includeHolidays),
        includeHolidayEves: Boolean(ln.includeHolidayEves),
        rangeStartDate: null,
        rangeEndDate: null,
        motifTypeId: params.motifTypeId,
        motifTypeLabel: null,
        createdAt: "",
        updatedAt: ""
      };
      for (const dayIso of dateAnchors) {
        if (!lineAppliesOnDate(ln, dayIso, params.holidayMatch)) continue;
        const specs = generateRandomSlotSpecs(lineRef, dayIso);
        for (const spec of specs) {
          pushIfInValidity(spec.calendarDateIso, spec.requestedTime ?? "", lineIndex);
        }
      }
      continue;
    }

    if (intervalMinutes != null) {
      const intervalAnchor =
        params.requestDate.trim() === params.validFrom.trim()
          ? { demandDateIso: params.requestDate.trim(), demandTimeHm: params.requestTime.trim() || "00:00" }
          : null;
      const intervalSlots = buildIntervalTimesAcrossValidity(
        params.validFrom.trim(),
        fromTimeNorm,
        rangeEndIso,
        toTimeNorm,
        intervalMinutes,
        intervalAnchor
      );
      for (const slot of intervalSlots) {
        if (!lineAppliesOnDate(ln, slot.requestDate, params.holidayMatch)) continue;
        pushIfInValidity(slot.requestDate, slot.requestedTime, lineIndex);
      }
      continue;
    }

    if (roundsCount != null) {
      for (const dayIso of dateAnchors) {
        if (!lineAppliesOnDate(ln, dayIso, params.holidayMatch)) continue;
        const maxMinute = dayIso === rangeEndIso ? hhmmToMinutes(toTimeNorm) : 23 * 60 + 59;
        const span = Math.max(0, maxMinute);
        for (let i = 0; i < roundsCount; i += 1) {
          const minute = roundsCount <= 1 ? 0 : Math.round((i * span) / (roundsCount - 1));
          pushIfInValidity(dayIso, minutesToHm(minute), lineIndex);
        }
      }
      continue;
    }

    for (const dayIso of dateAnchors) {
      if (!lineAppliesOnDate(ln, dayIso, params.holidayMatch)) continue;
      pushIfInValidity(dayIso, "", lineIndex);
    }
  }

  return { items, perLine };
}
