/**
 * Génère les horaires d’intervalle sur une plage de validité (demande exceptionnelle).
 */

import { formatLocalDateIso } from "../model/rondeCalendarLocal";
import { normalizeRondeHmOr, isRondeTimeHm } from "./rondeTime";

export function buildIntervalTimesAcrossValidity(
  startIso: string,
  startTime: string,
  endIso: string,
  endTime: string,
  intervalMinutes: number,
  anchor?: { demandDateIso: string; demandTimeHm: string } | null
): Array<{ requestDate: string; requestedTime: string }> {
  const safeInterval = Math.max(1, Math.round(intervalMinutes));
  const startTrim = String(startIso || "").trim();
  const startTimeTrim = normalizeRondeHmOr(String(startTime || ""), "00:00");
  const endTrim = String(endIso || "").trim();
  const endTimeTrim = normalizeRondeHmOr(String(endTime || ""), "23:59");
  const anchorDate = anchor?.demandDateIso?.trim();
  const anchorTime = anchor?.demandTimeHm?.trim();
  const useAnchor = Boolean(
    anchorDate && anchorDate === startTrim && anchorTime && isRondeTimeHm(anchorTime)
  );
  const periodStartCandidate = useAnchor
    ? new Date(`${startTrim}T${anchorTime}:00`)
    : new Date(`${startTrim}T${startTimeTrim}:00`);
  let periodStartMs = periodStartCandidate.getTime();
  if (Number.isNaN(periodStartMs)) {
    periodStartMs = new Date(`${startTrim}T${startTimeTrim}:00`).getTime();
  }
  const periodStart = new Date(periodStartMs);
  const periodEnd = new Date(`${endTrim}T${endTimeTrim}:00`);
  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime()) || periodEnd < periodStart) {
    return [];
  }
  const out: Array<{ requestDate: string; requestedTime: string }> = [];
  const cursor = new Date(periodStart.getTime());
  let safety = 0;
  while (cursor <= periodEnd && safety < 2000) {
    out.push({
      requestDate: formatLocalDateIso(cursor),
      requestedTime: `${String(cursor.getHours()).padStart(2, "0")}:${String(cursor.getMinutes()).padStart(2, "0")}`
    });
    cursor.setMinutes(cursor.getMinutes() + safeInterval);
    safety += 1;
  }
  return out;
}
