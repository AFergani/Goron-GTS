/**
 * Orchestrateur des passages d’une demande exceptionnelle (snapshot v1).
 *
 * Utilise le noyau `slotTimeKernel` et le moteur d’alignement demande / Validité Du.
 *
 * @module electron/store/domains/ronde/exceptionalSlotList
 */

const kernel = require("./slotTimeKernel");
const { floorValidityStartToRequest } = require("../../core/alignRequestValidity");

/**
 * @param {string} dateIso
 * @returns {number}
 */
function dateIsoToWeekdayMask(dateIso) {
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return 0;
  const day = d.getDay();
  const idxFromMon = day === 0 ? 6 : day - 1;
  return 1 << idxFromMon;
}

/**
 * @param {unknown} weekdaysMask
 * @param {string} dateIso
 * @returns {boolean}
 */
function isWeekdayEnabled(weekdaysMask, dateIso) {
  const m = Number(weekdaysMask);
  if (!Number.isFinite(m) || m <= 0) return true;
  return (m & dateIsoToWeekdayMask(dateIso)) !== 0;
}

/**
 * @param {string} startIso
 * @param {string} endIso
 * @returns {string[]}
 */
function enumerateDatesInclusive(startIso, endIso) {
  const out = [];
  let cursor = String(startIso || "").trim();
  const lim = String(endIso || "").trim();
  while (cursor <= lim) {
    out.push(cursor);
    cursor = kernel.addDaysIso(cursor, 1);
    if (out.length > 5000) break;
  }
  return out;
}

/**
 * @param {Set<string>} dateIsoSet
 */
function holidayMatcherFromSet(dateIsoSet) {
  const set = dateIsoSet instanceof Set ? dateIsoSet : new Set();
  return {
    isHoliday: (iso) => set.has(String(iso || "").trim()),
    isHolidayEve: (iso) => set.has(kernel.addDaysIso(String(iso || "").trim(), 1))
  };
}

/**
 * @param {object} ln
 * @param {string} dayIso
 * @param {{ isHoliday: Function, isHolidayEve: Function }} holidayMatch
 * @returns {boolean}
 */
function lineAppliesOnDate(ln, dayIso, holidayMatch) {
  if (isWeekdayEnabled(ln.weekdaysMask, dayIso)) return true;
  if (ln.includeHolidays && holidayMatch.isHoliday(dayIso)) return true;
  if (ln.includeHolidayEves && holidayMatch.isHolidayEve(dayIso)) return true;
  return false;
}

/**
 * @param {number} totalMinutes
 * @returns {string}
 */
function formatMinutesAsTime(totalMinutes) {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * @param {string} time
 * @returns {number}
 */
function hhmmToMinutes(time) {
  const value = String(time || "").trim();
  if (!kernel.TIME_RE.test(value)) return 0;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Calcule tous les passages attendus sur la plage de validité du snapshot.
 *
 * @param {object|null} snapshot - `version: 1`, validFrom/To, lignes.
 * @param {Set<string>|string[]} holidayDateIsoSet - Dates fériées.
 * @returns {Array<{ requestDate: string, requestedTime: string, lineIndex: number }>}
 */
function buildDesiredExceptionalSlotList(snapshot, holidayDateIsoSet) {
  if (!snapshot || snapshot.version !== 1) return [];
  const rangeEndIsoRaw =
    snapshot.validTo && String(snapshot.validTo).trim()
      ? String(snapshot.validTo).trim()
      : String(snapshot.validFrom || "").trim();
  const safeFromRaw = String(snapshot.validFrom || "").trim();
  if (!safeFromRaw || !rangeEndIsoRaw || rangeEndIsoRaw < safeFromRaw) return [];
  const validFromTimeRaw = kernel.TIME_RE.test(String(snapshot.validFromTime || "").trim())
    ? String(snapshot.validFromTime).trim()
    : "00:00";
  const validToTimeRaw = kernel.TIME_RE.test(String(snapshot.validToTime || "").trim())
    ? String(snapshot.validToTime).trim()
    : "23:59";
  const floored = floorValidityStartToRequest(
    {
      requestDate: snapshot.requestDate,
      requestTime: snapshot.requestTime,
      validFromDate: safeFromRaw,
      validFromTime: validFromTimeRaw,
      validToDate: rangeEndIsoRaw,
      validToTime: validToTimeRaw
    },
    { validityHasTime: true, compareEndTimes: true }
  );
  const safeFrom = String(floored.validFromDate || "").trim();
  const rangeEndIso = String(floored.validToDate || "").trim() || rangeEndIsoRaw;
  if (!safeFrom || !rangeEndIso || rangeEndIso < safeFrom) return [];
  const validFromTimeNorm = kernel.TIME_RE.test(String(floored.validFromTime || "").trim())
    ? String(floored.validFromTime).trim()
    : validFromTimeRaw;
  const validToTimeNorm = kernel.TIME_RE.test(String(floored.validToTime || "").trim())
    ? String(floored.validToTime).trim()
    : validToTimeRaw;
  const validityStartMs = kernel.parseDateTimeSafeMs(safeFrom, validFromTimeNorm);
  const validityEndMs = kernel.parseDateTimeSafeMs(rangeEndIso, validToTimeNorm);
  if (validityStartMs == null || validityEndMs == null || validityEndMs < validityStartMs) return [];

  const dateAnchors = enumerateDatesInclusive(safeFrom, rangeEndIso);
  const items = [];
  const set =
    holidayDateIsoSet instanceof Set
      ? holidayDateIsoSet
      : new Set((holidayDateIsoSet || []).map((v) => String(v || "").trim()).filter(Boolean));
  const hm = holidayMatcherFromSet(set);
  const lines = Array.isArray(snapshot.lines) ? snapshot.lines : [];
  const dedicated = [];

  const pushIfInValidity = (requestDateIso, requestedTimeHm, lineIndex) => {
    const timeNorm = kernel.TIME_RE.test(String(requestedTimeHm || "").trim())
      ? String(requestedTimeHm).trim()
      : "00:00";
    const ms = kernel.parseDateTimeSafeMs(requestDateIso, timeNorm);
    if (ms == null || ms < validityStartMs || ms > validityEndMs) return;
    items.push({ requestDate: requestDateIso, requestedTime: requestedTimeHm, lineIndex });
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const raw = lines[lineIndex] || {};
    const rk = String(raw.roundKind || "").trim();
    if (!rk) continue;
    const kind = rk === "OPENING" || rk === "CLOSING" || rk === "ACCOMPAGNEMENT" || rk === "RANDOM" ? rk : "RANDOM";
    if (kind === "RANDOM") continue;
    const requestedTime = String(raw.requestedTime ?? "");
    const ln = {
      roundKind: kind,
      requestedTime,
      weekdaysMask: typeof raw.weekdaysMask === "number" ? raw.weekdaysMask : Number(raw.weekdaysMask) || 0,
      includeHolidays: Boolean(raw.includeHolidays),
      includeHolidayEves: Boolean(raw.includeHolidayEves)
    };
    for (const dayIso of dateAnchors) {
      if (!lineAppliesOnDate(ln, dayIso, hm)) continue;
      const timeNorm = kernel.TIME_RE.test(requestedTime.trim()) ? requestedTime.trim() : "00:00";
      const ms = kernel.parseDateTimeSafeMs(dayIso, timeNorm);
      if (ms == null || ms < validityStartMs || ms > validityEndMs) continue;
      dedicated.push({ kind, ms });
      items.push({ requestDate: dayIso, requestedTime: requestedTime.trim(), lineIndex });
    }
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const raw = lines[lineIndex] || {};
    const rk = String(raw.roundKind || "").trim();
    if (!rk) continue;
    const ln = {
      roundKind: rk === "OPENING" || rk === "CLOSING" || rk === "ACCOMPAGNEMENT" || rk === "RANDOM" ? rk : "RANDOM",
      requestedTime: String(raw.requestedTime ?? ""),
      randomWindowStart: String(raw.randomWindowStart ?? ""),
      randomWindowEnd: String(raw.randomWindowEnd ?? ""),
      randomRoundsCount: String(raw.randomRoundsCount ?? ""),
      intervalHours: String(raw.intervalHours ?? ""),
      intervalEndTime: String(raw.intervalEndTime ?? "").trim() || "23:59",
      weekdaysMask: typeof raw.weekdaysMask === "number" ? raw.weekdaysMask : Number(raw.weekdaysMask) || 0,
      includeHolidays: Boolean(raw.includeHolidays),
      includeHolidayEves: Boolean(raw.includeHolidayEves)
    };

    if (ln.roundKind !== "RANDOM") continue;

    const intervalMinutes = ln.intervalHours.trim() ? Math.max(1, Math.round(Number(ln.intervalHours) * 60)) : null;
    const roundsCount = ln.randomRoundsCount.trim() ? Math.max(1, Math.round(Number(ln.randomRoundsCount))) : null;
    const hasCompleteWindow = Boolean(ln.randomWindowStart.trim() && ln.randomWindowEnd.trim());

    if (intervalMinutes != null && !hasCompleteWindow) {
      const intervalSlots = kernel.walkIntervalHonoringOpeningClosing({
        validityStartMs,
        validityEndMs,
        intervalMinutes,
        dedicated
      });
      for (const slot of intervalSlots) {
        if (!lineAppliesOnDate(ln, slot.requestDate, hm)) continue;
        pushIfInValidity(slot.requestDate, slot.requestedTime, lineIndex);
      }
      continue;
    }

    if (hasCompleteWindow) {
      for (const dayIso of dateAnchors) {
        if (!lineAppliesOnDate(ln, dayIso, hm)) continue;
        const specs = kernel.generateRandomWindowSlots({
          anchorDateIso: dayIso,
          windowStart: ln.randomWindowStart.trim(),
          windowEnd: ln.randomWindowEnd.trim(),
          intervalMinutes,
          roundsCount,
          dedicated
        });
        for (const spec of specs) {
          const occ = spec.occurrenceDateIso || spec.calendarDateIso;
          pushIfInValidity(occ, spec.requestedTime || "", lineIndex);
        }
      }
      continue;
    }

    if (roundsCount != null) {
      const hasOpenClose = dedicated.some((d) => d.kind === "OPENING" || d.kind === "CLOSING");
      if (hasOpenClose) {
        const slots = kernel.generateCountSlotsHonoringDedicated({
          rangeStartMs: validityStartMs,
          rangeEndMs: validityEndMs,
          count: roundsCount,
          dedicated
        });
        for (const slot of slots) {
          pushIfInValidity(slot.requestDate, slot.requestedTime, lineIndex);
        }
      } else {
        const dedicatedMs = new Set(dedicated.map((d) => d.ms));
        for (const dayIso of dateAnchors) {
          if (!lineAppliesOnDate(ln, dayIso, hm)) continue;
          const maxMinute =
            dayIso === rangeEndIso && ln.intervalEndTime.trim()
              ? hhmmToMinutes(ln.intervalEndTime.trim())
              : 23 * 60 + 59;
          const span = Math.max(0, maxMinute);
          for (let i = 0; i < roundsCount; i += 1) {
            const minute = roundsCount <= 1 ? 0 : Math.round((i * span) / (roundsCount - 1));
            const hmTime = formatMinutesAsTime(minute);
            const ms = kernel.parseDateTimeSafeMs(dayIso, hmTime);
            if (ms != null && dedicatedMs.has(ms)) continue;
            pushIfInValidity(dayIso, hmTime, lineIndex);
          }
        }
      }
      continue;
    }

    for (const dayIso of dateAnchors) {
      if (!lineAppliesOnDate(ln, dayIso, hm)) continue;
      pushIfInValidity(dayIso, "", lineIndex);
    }
  }

  return items;
}

module.exports = {
  buildDesiredExceptionalSlotList
};
