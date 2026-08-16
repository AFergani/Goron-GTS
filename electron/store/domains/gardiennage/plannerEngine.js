/**
 * Moteur pur de génération des créneaux de Gardiennage à partir d'un snapshot V1.
 *
 * Partagé conceptuellement avec la prévisualisation React ; aucune base n'est consultée ici.
 *
 * @module electron/store/domains/gardiennage/plannerEngine
 */

/** @param {number} value @returns {string} */
function pad2(value) {
  return String(value).padStart(2, "0");
}

/** @param {string} isoDate @returns {Date} */
function atNoon(isoDate) {
  return new Date(`${isoDate}T12:00:00`);
}

/** @param {string} isoDate @param {number} amount @returns {string} */
function addDays(isoDate, amount) {
  const date = atNoon(isoDate);
  date.setDate(date.getDate() + amount);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** @param {string} isoDate @param {string} hhmm @returns {string} */
function toIsoDateTime(isoDate, hhmm) {
  return `${isoDate}T${hhmm}:00`;
}

/** @param {string} isoDate @returns {number} */
function dayBitFromIsoDate(isoDate) {
  return 1 << atNoon(isoDate).getDay();
}

/** @param {unknown} value @returns {boolean} */
function isIsoDate(value) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(String(value)));
}

/** @param {unknown} value @returns {boolean} */
function isValidPlanningTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || "").trim());
}

/** @param {string} from @param {string} to @returns {string} */
function resolveH24ValidToTime(from, to) {
  if (isValidPlanningTime(to)) return String(to).trim();
  return isValidPlanningTime(from) ? String(from).trim() : "";
}

/**
 * Construit les prédicats jour férié et veille de jour férié.
 *
 * @param {string[]} holidayDateIsos
 * @returns {{isHoliday:(iso:string)=>boolean,isHolidayEve:(iso:string)=>boolean}}
 */
function buildHolidayMatchers(holidayDateIsos) {
  const dates = new Set((holidayDateIsos || []).map((iso) => String(iso || "").trim()).filter(Boolean));
  return {
    isHoliday: (iso) => dates.has(String(iso || "").trim()),
    isHolidayEve: (iso) => dates.has(addDays(String(iso || "").trim(), 1))
  };
}

/** @param {object} line @param {string} dateIso @returns {boolean} */
function lineMatchesWeekday(line, dateIso) {
  const mask = Number(line.weekdaysMask ?? 0);
  return mask <= 0 || (mask & dayBitFromIsoDate(dateIso)) !== 0;
}

/** @param {object} line @param {string} dateIso @param {object} holiday @returns {boolean} */
function lineAppliesOnDate(line, dateIso, holiday) {
  if (isIsoDate(line.anchorDate)) return line.anchorDate === dateIso;
  if (holiday.isHoliday(dateIso) && !line.includeHolidays) return false;
  return lineMatchesWeekday(line, dateIso)
    || (holiday.isHoliday(dateIso) && line.includeHolidays)
    || (holiday.isHolidayEve(dateIso) && line.includeHolidayEves);
}

/**
 * Collecte les dates actives d'une ligne dans sa période de validité.
 *
 * @param {object} line
 * @param {string} validFromDate
 * @param {string} validToDate
 * @param {Set<string>} skipDates
 * @param {{isHoliday:Function,isHolidayEve:Function}} holiday
 * @returns {string[]}
 */
function collectActiveDatesForLine(line, validFromDate, validToDate, skipDates, holiday) {
  if (isIsoDate(line.anchorDate)) {
    return line.anchorDate >= validFromDate && line.anchorDate <= validToDate ? [line.anchorDate] : [];
  }
  const dates = [];
  let cursor = validFromDate;
  while (cursor <= validToDate) {
    if (!skipDates.has(cursor) && lineAppliesOnDate(line, cursor, holiday)) dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

/** @param {string} aStart @param {string} aEnd @param {string} bStart @param {string} bEnd @returns {boolean} */
function intersects(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/** @returns {[string,string]|null} */
function clipSegment(segmentStart, segmentEnd, rangeStart, rangeEnd) {
  if (!intersects(segmentStart, segmentEnd, rangeStart, rangeEnd)) return null;
  const start = segmentStart > rangeStart ? segmentStart : rangeStart;
  const end = segmentEnd < rangeEnd ? segmentEnd : rangeEnd;
  return start < end ? [start, end] : null;
}

/**
 * Génère les créneaux insérables depuis un snapshot normalisé.
 *
 * @param {object} snapshot
 * @param {{holidayDateIsos?:string[]}} [options]
 * @returns {Array<{lineLabel:string,startIso:string,endIso:string,startDate:string,endDate:string,startTime:string,endTime:string,crossesMidnight:boolean}>}
 */
function buildGardiennageSlotsFromSnapshot(snapshot, options = {}) {
  const fromTime = String(snapshot.validFromTime || "").trim();
  const toTime = snapshot.isContinuous
    ? resolveH24ValidToTime(fromTime, snapshot.validToTime)
    : String(snapshot.validToTime || "").trim();
  if (!isValidPlanningTime(fromTime) || !isValidPlanningTime(toTime)) return [];
  const rangeStart = toIsoDateTime(snapshot.validFromDate, fromTime);
  const rangeEnd = toIsoDateTime(snapshot.validToDate, toTime);
  if (rangeStart >= rangeEnd) return [];
  if (snapshot.isContinuous) {
    return [{
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
  const holiday = buildHolidayMatchers(options.holidayDateIsos);
  const anchoredDates = new Set(
    (snapshot.lines || []).map((line) => (isIsoDate(line.anchorDate) ? line.anchorDate : "")).filter(Boolean)
  );
  const slots = [];
  for (const line of snapshot.lines || []) {
    if (!line.startTime || !line.endTime) continue;
    const dates = collectActiveDatesForLine(
      line,
      snapshot.validFromDate,
      snapshot.validToDate,
      anchoredDates,
      holiday
    );
    for (const date of dates) {
      const startIso = toIsoDateTime(date, line.startTime);
      const crossesMidnight = line.endTime <= line.startTime;
      const endIso = toIsoDateTime(crossesMidnight ? addDays(date, 1) : date, line.endTime);
      const clipped = clipSegment(startIso, endIso, rangeStart, rangeEnd);
      if (!clipped) continue;
      slots.push({
        lineLabel: line.label || "Ligne",
        startIso: clipped[0],
        endIso: clipped[1],
        startDate: clipped[0].slice(0, 10),
        endDate: clipped[1].slice(0, 10),
        startTime: clipped[0].slice(11, 16),
        endTime: clipped[1].slice(11, 16),
        crossesMidnight: clipped[0].slice(0, 10) !== clipped[1].slice(0, 10)
      });
    }
  }
  slots.sort((left, right) => left.startIso.localeCompare(right.startIso));
  return slots;
}

module.exports = {
  buildGardiennageSlotsFromSnapshot,
  buildHolidayMatchers,
  collectActiveDatesForLine
};
