/**
 * Helpers synchrones de validation, dates et créneaux du Gardiennage.
 *
 * Ce module ne réalise aucun accès à une base de données.
 *
 * @module electron/store/domains/gardiennage/helpers
 */

const {
  buildHolidayMatchers,
  collectActiveDatesForLine
} = require("./plannerEngine");

/** @param {unknown} value @returns {string} Date ISO ou chaîne vide. */
function toIsoDate(value) {
  const raw = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

/** @param {unknown} value @returns {string} Heure HH:mm ou chaîne vide. */
function toIsoTime(value) {
  const raw = String(value || "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : "";
}

/** @param {unknown} value @returns {boolean} */
function isIsoDate(value) {
  return Boolean(toIsoDate(value));
}

/** @param {string} value @returns {number} Minutes depuis minuit, ou -1. */
function parseTimeToMinutes(value) {
  const hhmm = toIsoTime(value);
  if (!hhmm) return -1;
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

/** @param {string} isoDate @param {number} amount @returns {string} */
function addDaysIso(isoDate, amount) {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + amount);
  const pad2 = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** @param {string} validFromDate @returns {string} */
function computeInitialOpenEndedDate(validFromDate) {
  const today = new Date().toISOString().slice(0, 10);
  const fromHorizon = addDaysIso(validFromDate, 90);
  const todayHorizon = addDaysIso(today, 90);
  return fromHorizon > todayHorizon ? fromHorizon : todayHorizon;
}

/**
 * Refuse les chevauchements entre lignes d'un snapshot.
 *
 * @param {object|null} snapshot
 * @param {string[]} holidayDateIsos
 * @returns {void}
 */
function validatePlanningLinesNoOverlap(snapshot, holidayDateIsos) {
  if (!snapshot || snapshot.isContinuous) return;
  const holiday = buildHolidayMatchers(holidayDateIsos);
  const anchoredStartDates = new Set(
    (snapshot.lines || [])
      .map((line) => (isIsoDate(line.anchorDate) ? line.anchorDate : ""))
      .filter(Boolean)
  );
  const daySegments = {};
  const pushSegment = (isoDate, segment) => {
    if (!daySegments[isoDate]) daySegments[isoDate] = [];
    daySegments[isoDate].push(segment);
  };
  for (const line of snapshot.lines || []) {
    const start = parseTimeToMinutes(line.startTime);
    const end = parseTimeToMinutes(line.endTime);
    if (start < 0 || end < 0) continue;
    const activeDates = collectActiveDatesForLine(
      line,
      snapshot.validFromDate,
      snapshot.validToDate,
      anchoredStartDates,
      holiday
    );
    for (const activeDate of activeDates) {
      if (end > start) {
        pushSegment(activeDate, { start, end });
      } else if (end < start) {
        pushSegment(activeDate, { start, end: 24 * 60 });
        pushSegment(addDaysIso(activeDate, 1), { start: 0, end });
      } else {
        pushSegment(activeDate, { start: 0, end: 24 * 60 });
      }
    }
  }
  for (const segments of Object.values(daySegments)) {
    segments.sort((left, right) => left.start - right.start);
    for (let index = 1; index < segments.length; index += 1) {
      if (segments[index].start < segments[index - 1].end) {
        const error = new Error("Chevauchement détecté entre lignes de planification.");
        error.code = "GARDIENNAGE_PLANNER_OVERLAP";
        throw error;
      }
    }
  }
}

/**
 * Normalise le snapshot de planification V1.
 *
 * @param {object} payload
 * @returns {object|null}
 */
function normalizePlanningSnapshot(payload) {
  const snapshot = payload.planningSnapshot;
  if (!snapshot || Number(snapshot.version) !== 1) return null;
  const validFromDate = toIsoDate(snapshot.validFromDate);
  const validFromTime = toIsoTime(snapshot.validFromTime);
  const isContinuous = Boolean(snapshot.isContinuous);
  const validToTime = toIsoTime(snapshot.validToTime) || (isContinuous ? validFromTime : "");
  const isOpenEnded = Boolean(snapshot.isOpenEnded);
  const validToDate = toIsoDate(snapshot.validToDate)
    || (isOpenEnded ? computeInitialOpenEndedDate(validFromDate) : "");
  if (!validFromDate || !validFromTime || !validToDate || !validToTime) return null;
  return {
    version: 1,
    validFromDate,
    validFromTime,
    validToDate,
    validToTime,
    isContinuous,
    isOpenEnded,
    lines: Array.isArray(snapshot.lines)
      ? snapshot.lines.map((line, index) => ({
        id: String(line.id || `line-${index + 1}`),
        label: String(line.label || `Ligne ${index + 1}`),
        anchorDate: toIsoDate(line.anchorDate),
        startTime: toIsoTime(line.startTime),
        endTime: toIsoTime(line.endTime),
        weekdaysMask: Number.isFinite(Number(line.weekdaysMask)) ? Number(line.weekdaysMask) : 127,
        includeHolidays: Boolean(line.includeHolidays),
        includeHolidayEves: Boolean(line.includeHolidayEves)
      })).filter((line) => line.startTime && line.endTime)
      : []
  };
}

/** @param {object|null} snapshot @returns {boolean} */
function isPonctuelPlanningSnapshot(snapshot) {
  if (!snapshot || snapshot.isContinuous) return false;
  return Array.isArray(snapshot.lines)
    && snapshot.lines.length === 1
    && snapshot.lines[0]?.id === "ponctuel-slot";
}

/** @param {object} slot @param {object} closedRow @returns {boolean} */
function slotConflictsWithClosedRow(slot, closedRow) {
  const closedStart = String(closedRow.planning_slot_start || "").trim();
  const closedEnd = String(closedRow.planning_slot_end || "").trim();
  if (closedStart && closedEnd) return slot.startIso < closedEnd && closedStart < slot.endIso;
  return String(closedRow.recurrence_start_date || "") === slot.startDate
    && String(closedRow.start_time || "") === slot.startTime
    && String(closedRow.end_time || "") === slot.endTime;
}

/** @param {object[]} slots @param {object[]} closedRows @returns {object[]} */
function filterSlotsPreservingClosed(slots, closedRows) {
  return closedRows.length
    ? slots.filter((slot) => !closedRows.some((row) => slotConflictsWithClosedRow(slot, row)))
    : slots;
}

/** Nombre de jours après la fin prévue avant clôture automatique. */
const GARDIENNAGE_AUTO_CLOSE_GRACE_DAYS = 3;
const MS_PER_DAY = 86400000;

/**
 * Parse le snapshot de planification d'une ligne SQL.
 *
 * @param {unknown} raw
 * @returns {object|null}
 */
function parsePlanningSnapshotJson(raw) {
  try {
    const snapshot = raw && typeof raw === "object" ? raw : JSON.parse(String(raw || ""));
    return snapshot && Number(snapshot.version) === 1 ? snapshot : null;
  } catch {
    return null;
  }
}

/**
 * H24 jusqu'à nouvel ordre : pas de clôture manuelle ni automatique tant qu'une date de fin n'est pas enregistrée.
 *
 * @param {object|null} snapshot
 * @returns {boolean}
 */
function isOpenEndedContinuousSnapshot(snapshot) {
  return Boolean(snapshot?.isOpenEnded && snapshot?.isContinuous);
}

/**
 * @param {object} row - Ligne SQL gardiennage
 * @returns {boolean}
 */
function isOpenEndedContinuousRow(row) {
  return isOpenEndedContinuousSnapshot(parsePlanningSnapshotJson(row?.planning_snapshot_json));
}

/**
 * Instant de fin du créneau (ms), ou `null` si indéterminable.
 *
 * @param {object} row
 * @returns {number|null}
 */
function resolveSlotEndMs(row) {
  const slotEnd = String(row.planning_slot_end || "").trim();
  if (slotEnd) {
    const timestamp = new Date(slotEnd.length === 16 ? `${slotEnd}:00` : slotEnd).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
  }
  const activeDate = toIsoDate(row.recurrence_start_date);
  const endTime = toIsoTime(row.end_time);
  if (!activeDate || !endTime) return null;
  const endDate = row.crosses_midnight ? addDaysIso(activeDate, 1) : (toIsoDate(row.recurrence_end_date) || activeDate);
  const timestamp = new Date(`${endDate}T${endTime}:00`).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

/**
 * Clôture manuelle autorisée après la fin prévue.
 * H24 jusqu'à nouvel ordre : refusé tant qu'une date de fin n'est pas enregistrée.
 *
 * @param {object} row
 * @param {number} [nowMs]
 * @returns {boolean}
 */
function isManualCloseAllowed(row, nowMs = Date.now()) {
  const status = String(row.status || "");
  if (status === "CLOTURE" || status === "ANNULE") return false;
  if (isOpenEndedContinuousRow(row)) return false;
  const endMs = resolveSlotEndMs(row);
  if (endMs == null) return false;
  return nowMs >= endMs;
}

/**
 * Clôture auto due : fin prévue + 3 jours, hors H24 ouvert.
 *
 * @param {object} row
 * @param {number} [nowMs]
 * @returns {boolean}
 */
function isAutoCloseDue(row, nowMs = Date.now()) {
  const status = String(row.status || "");
  if (status !== "PLANIFIE" && status !== "ACTIF") return false;
  if (isOpenEndedContinuousRow(row)) return false;
  const endMs = resolveSlotEndMs(row);
  if (endMs == null) return false;
  return nowMs >= endMs + GARDIENNAGE_AUTO_CLOSE_GRACE_DAYS * MS_PER_DAY;
}

module.exports = {
  addDaysIso,
  filterSlotsPreservingClosed,
  GARDIENNAGE_AUTO_CLOSE_GRACE_DAYS,
  isAutoCloseDue,
  isIsoDate,
  isManualCloseAllowed,
  isOpenEndedContinuousRow,
  isPonctuelPlanningSnapshot,
  normalizePlanningSnapshot,
  parseTimeToMinutes,
  resolveSlotEndMs,
  toIsoDate,
  toIsoTime,
  validatePlanningLinesNoOverlap
};
