import type { GardiennagePlanningSnapshotV1 } from "./gardiennage.types";
import { isValidPlanningTime } from "./gardiennagePlanningForm";
import {
  buildHolidayMatchers,
  collectActiveDatesForLine,
  isIsoDate,
  shiftIsoDate
} from "./gardiennagePlanningCalendar";

export type GardiennageGeneratedSlot = {
  lineId: string;
  lineLabel: string;
  startIso: string;
  endIso: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function toIsoDateTime(isoDate: string, hhmm: string): string {
  return `${isoDate}T${hhmm}:00`;
}

function intersects(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA < endB && startB < endA;
}

function clipSegment(segmentStart: string, segmentEnd: string, rangeStart: string, rangeEnd: string): [string, string] | null {
  if (!intersects(segmentStart, segmentEnd, rangeStart, rangeEnd)) return null;
  const start = segmentStart > rangeStart ? segmentStart : rangeStart;
  const end = segmentEnd < rangeEnd ? segmentEnd : rangeEnd;
  if (start >= end) return null;
  return [start, end];
}

export type BuildGardiennageSlotsOptions = {
  holidayDateIsos?: string[];
};

export function buildGardiennageSlotsFromSnapshot(
  snapshot: GardiennagePlanningSnapshotV1,
  options: BuildGardiennageSlotsOptions = {}
): GardiennageGeneratedSlot[] {
  const fromTime = String(snapshot.validFromTime || "").trim();
  const toTime = String(snapshot.validToTime || "").trim();
  if (!isValidPlanningTime(fromTime) || !isValidPlanningTime(toTime)) return [];
  const rangeStart = toIsoDateTime(snapshot.validFromDate, fromTime);
  const rangeEnd = toIsoDateTime(snapshot.validToDate, toTime);
  if (rangeStart >= rangeEnd) return [];

  const holiday = buildHolidayMatchers(options.holidayDateIsos || []);

  if (snapshot.isContinuous) {
    return [{
      lineId: "continuous",
      lineLabel: "Couverture continue",
      startIso: rangeStart,
      endIso: rangeEnd,
      startDate: rangeStart.slice(0, 10),
      endDate: rangeEnd.slice(0, 10),
      startTime: rangeStart.slice(11, 16),
      endTime: rangeEnd.slice(11, 16),
      crossesMidnight: rangeStart.slice(0, 10) !== rangeEnd.slice(0, 10)
    }];
  }

  const slots: GardiennageGeneratedSlot[] = [];
  const anchoredStartDates = new Set(
    (snapshot.lines || [])
      .map((line) => (isIsoDate(line.anchorDate) ? line.anchorDate : ""))
      .filter((value) => Boolean(value))
  );
  for (const line of snapshot.lines) {
    if (!line.startTime || !line.endTime) continue;
    const activeDates = collectActiveDatesForLine(
      line,
      snapshot.validFromDate,
      snapshot.validToDate,
      anchoredStartDates,
      holiday
    );
    for (const activeDate of activeDates) {
      const startIso = toIsoDateTime(activeDate, line.startTime);
      const crossesMidnight = line.endTime <= line.startTime;
      const endDate = crossesMidnight ? shiftIsoDate(activeDate, 1) : activeDate;
      const endIso = toIsoDateTime(endDate, line.endTime);
      const clipped = clipSegment(startIso, endIso, rangeStart, rangeEnd);
      if (!clipped) continue;
      const [slotStart, slotEnd] = clipped;
      slots.push({
        lineId: line.id,
        lineLabel: line.label,
        startIso: slotStart,
        endIso: slotEnd,
        startDate: slotStart.slice(0, 10),
        endDate: slotEnd.slice(0, 10),
        startTime: slotStart.slice(11, 16),
        endTime: slotEnd.slice(11, 16),
        crossesMidnight: slotStart.slice(0, 10) !== slotEnd.slice(0, 10)
      });
    }
  }
  slots.sort((a, b) => a.startIso.localeCompare(b.startIso));
  return slots;
}
