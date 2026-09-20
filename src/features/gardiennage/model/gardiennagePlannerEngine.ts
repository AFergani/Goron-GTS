/**
 * Moteur client de génération des créneaux gardiennage à partir d’un snapshot de planification.
 *
 * Produit des slots datés/heure (y compris nocturnes et mode continu H24), découpés dans
 * la fenêtre validFrom → validTo. S’appuie sur `gardiennagePlanningCalendar` pour les jours actifs.
 *
 * Utilisé par : `GardiennageEntryModal` (prévisualisation avant enregistrement).
 */

import type { GardiennagePlanningSnapshotV1 } from "./gardiennage.types";
import { floorValidityStartToRequest } from "../../common/utils/alignRequestAndValidity";
import { isValidPlanningTime, resolveH24ValidToTime } from "./gardiennagePlanningForm";
import {
  buildHolidayMatchers,
  collectActiveDatesForLine,
  isIsoDate,
  shiftIsoDate
} from "./gardiennagePlanningCalendar";

/** Créneau généré pour affichage ou persistance backend */
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

/** Génère la liste des créneaux couverts par le snapshot (triés par début). */
export function buildGardiennageSlotsFromSnapshot(
  snapshot: GardiennagePlanningSnapshotV1,
  options: BuildGardiennageSlotsOptions = {}
): GardiennageGeneratedSlot[] {
  const fromTime = String(snapshot.validFromTime || "").trim();
  const toTime = snapshot.isContinuous
    ? resolveH24ValidToTime(fromTime, String(snapshot.validToTime || "").trim())
    : String(snapshot.validToTime || "").trim();
  if (!isValidPlanningTime(fromTime) || !isValidPlanningTime(toTime)) return [];
  const validityHasTime = Boolean(snapshot.isContinuous) || fromTime !== "00:00";
  const floored = floorValidityStartToRequest(
    {
      requestDate: String(snapshot.requestDate || ""),
      requestTime: String(snapshot.requestTime || ""),
      validFromDate: snapshot.validFromDate,
      validFromTime: fromTime,
      validToDate: snapshot.validToDate,
      validToTime: toTime
    },
    { validityHasTime, compareEndTimes: false }
  );
  const fromDate = floored.validFromDate || snapshot.validFromDate;
  const toDate = floored.validToDate || snapshot.validToDate;
  const effectiveFromTime = floored.validFromTime || fromTime;
  const effectiveToTime = floored.validToTime || toTime;
  if (!isValidPlanningTime(effectiveFromTime) || !isValidPlanningTime(effectiveToTime)) return [];
  const rangeStart = toIsoDateTime(fromDate, effectiveFromTime);
  const rangeEnd = toIsoDateTime(toDate, effectiveToTime);
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
      fromDate,
      toDate,
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
