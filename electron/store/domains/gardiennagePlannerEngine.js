function pad2(value) {
  return String(value).padStart(2, "0");
}

function atNoon(isoDate) {
  return new Date(`${isoDate}T12:00:00`);
}

function addDays(isoDate, amount) {
  const d = atNoon(isoDate);
  d.setDate(d.getDate() + amount);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toIsoDateTime(isoDate, hhmm) {
  return `${isoDate}T${hhmm}:00`;
}

function dayBitFromIsoDate(isoDate) {
  const day = atNoon(isoDate).getDay();
  return 1 << day;
}

function isIsoDate(value) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(String(value)));
}

function isValidPlanningTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || "").trim());
}

function buildHolidayMatchers(holidayDateIsos) {
  const set = new Set((holidayDateIsos || []).map((iso) => String(iso || "").trim()).filter(Boolean));
  return {
    isHoliday: (iso) => set.has(String(iso || "").trim()),
    isHolidayEve: (iso) => set.has(addDays(String(iso || "").trim(), 1))
  };
}

function lineMatchesWeekday(line, dateIso) {
  const mask = Number(line.weekdaysMask ?? 0);
  if (mask <= 0) return true;
  return (mask & dayBitFromIsoDate(dateIso)) !== 0;
}

function gardiennageLineAppliesOnDate(line, dateIso, holiday) {
  if (isIsoDate(line.anchorDate)) return line.anchorDate === dateIso;
  if (holiday.isHoliday(dateIso) && !line.includeHolidays) return false;
  if (lineMatchesWeekday(line, dateIso)) return true;
  if (holiday.isHoliday(dateIso) && line.includeHolidays) return true;
  if (holiday.isHolidayEve(dateIso) && line.includeHolidayEves) return true;
  return false;
}

function collectActiveDatesForLine(line, validFromDate, validToDate, skipDates, holiday) {
  if (isIsoDate(line.anchorDate)) {
    return skipDates.has(line.anchorDate) ? [] : [line.anchorDate];
  }
  const activeDates = [];
  let cursor = validFromDate;
  while (cursor <= validToDate) {
    if (!skipDates.has(cursor) && gardiennageLineAppliesOnDate(line, cursor, holiday)) {
      activeDates.push(cursor);
    }
    cursor = addDays(cursor, 1);
  }
  return activeDates;
}

function intersects(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function clipSegment(segmentStart, segmentEnd, rangeStart, rangeEnd) {
  if (!intersects(segmentStart, segmentEnd, rangeStart, rangeEnd)) return null;
  const start = segmentStart > rangeStart ? segmentStart : rangeStart;
  const end = segmentEnd < rangeEnd ? segmentEnd : rangeEnd;
  if (start >= end) return null;
  return [start, end];
}

function buildGardiennageSlotsFromSnapshot(snapshot, options = {}) {
  const fromTime = String(snapshot.validFromTime || "").trim();
  const toTime = String(snapshot.validToTime || "").trim();
  if (!isValidPlanningTime(fromTime) || !isValidPlanningTime(toTime)) return [];
  const rangeStart = toIsoDateTime(snapshot.validFromDate, fromTime);
  const rangeEnd = toIsoDateTime(snapshot.validToDate, toTime);
  if (rangeStart >= rangeEnd) return [];

  const holiday = buildHolidayMatchers(options.holidayDateIsos);

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

  const slots = [];
  const anchoredStartDates = new Set(
    (snapshot.lines || [])
      .map((line) => (isIsoDate(line.anchorDate) ? line.anchorDate : ""))
      .filter((value) => Boolean(value))
  );
  for (const line of snapshot.lines || []) {
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
      const endDate = crossesMidnight ? addDays(activeDate, 1) : activeDate;
      const endIso = toIsoDateTime(endDate, line.endTime);
      const clipped = clipSegment(startIso, endIso, rangeStart, rangeEnd);
      if (!clipped) continue;
      const [slotStart, slotEnd] = clipped;
      slots.push({
        lineLabel: line.label || "Ligne",
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

module.exports = {
  buildGardiennageSlotsFromSnapshot,
  collectActiveDatesForLine,
  buildHolidayMatchers
};
