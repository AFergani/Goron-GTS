/**
 * Helpers synchrones de dates, horaires et créneaux du Gardiennage.
 *
 * Aucun accès base. Appelé par `entries.js`, `entriesLifecycle.js`,
 * `autoClose.js` et `openEndedHorizon.js`.
 *
 * @module electron/store/domains/gardiennage/helpers
 */

const { addDaysIso, normalizeDateIso, normalizeTimeHm } = require("../../core/isoDate");
const {
  buildHolidayMatchers,
  collectActiveDatesForLine
} = require("./plannerEngine");

/** Nombre de jours après la fin prévue avant clôture automatique (rondes exceptionnelles : même délai). */
const GARDIENNAGE_AUTO_CLOSE_GRACE_DAYS = 3;
/** Horizon de génération / glissement pour H24 sans date de fin. */
const GARDIENNAGE_OPEN_ENDED_HORIZON_DAYS = 90;
/** Statuts encore ouverts (clôture auto / horizon glissant). */
const OPEN_STATUSES_SQL = "status IN ('PLANIFIE', 'ACTIF')";
const MS_PER_DAY = 86400000;

/**
 * @param {number} value
 * @returns {string}
 */
function pad2(value) {
  return String(value).padStart(2, "0");
}

/**
 * Date calendaire locale `AAAA-MM-JJ` (évite le décalage UTC de `toISOString`).
 *
 * @param {Date} [date]
 * @returns {string}
 */
function localDateIso(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Acteur des jobs de fond (clôture auto, horizon H24).
 * Distinct de `actorName` (repli `"unknown"`).
 *
 * @param {unknown} username
 * @param {string} fallback
 * @returns {string}
 */
function resolveSystemActor(username, fallback) {
  return String(username || fallback).trim() || fallback;
}

/**
 * Heure `HH:mm` (00:00–23:59) ou chaîne vide.
 *
 * @param {unknown} value
 * @returns {string}
 */
function toIsoTime(value) {
  return normalizeTimeHm(value);
}

/**
 * Fin d'horizon H24 ouvert : max(début + 90 j, référence + 90 j).
 *
 * @param {unknown} validFromDate
 * @param {unknown} [referenceDateIso]
 * @returns {string}
 */
function computeOpenEndedHorizonEndDate(validFromDate, referenceDateIso) {
  const reference = normalizeDateIso(referenceDateIso) || localDateIso();
  const from = normalizeDateIso(validFromDate) || reference;
  const fromHorizon = addDaysIso(from, GARDIENNAGE_OPEN_ENDED_HORIZON_DAYS);
  const referenceHorizon = addDaysIso(reference, GARDIENNAGE_OPEN_ENDED_HORIZON_DAYS);
  return fromHorizon > referenceHorizon ? fromHorizon : referenceHorizon;
}

/**
 * @param {string} value
 * @returns {number} Minutes depuis minuit, ou -1.
 */
function parseTimeToMinutes(value) {
  const hhmm = toIsoTime(value);
  if (!hhmm) return -1;
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Refuse les chevauchements entre lignes d'un snapshot (hors H24 continu).
 *
 * @param {object|null} snapshot
 * @param {string[]} holidayDateIsos
 * @returns {void}
 * @throws {{ code: string }} `GARDIENNAGE_PLANNER_OVERLAP` si deux segments se recouvrent.
 */
function validatePlanningLinesNoOverlap(snapshot, holidayDateIsos) {
  if (!snapshot || snapshot.isContinuous) return;
  const holiday = buildHolidayMatchers(holidayDateIsos);
  const anchoredStartDates = new Set(
    (snapshot.lines || [])
      .map((line) => normalizeDateIso(line.anchorDate))
      .filter(Boolean)
  );
  const daySegments = {};
  const pushSegment = (isoDate, segment) => {
    if (!isoDate) return;
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
 * Normalise le snapshot de planification V1 (dates calendaires réelles).
 *
 * @param {object} payload
 * @returns {object|null}
 */
function normalizePlanningSnapshot(payload) {
  const snapshot = payload.planningSnapshot;
  if (!snapshot || Number(snapshot.version) !== 1) return null;
  const validFromDate = normalizeDateIso(snapshot.validFromDate);
  const validFromTime = toIsoTime(snapshot.validFromTime);
  const isContinuous = Boolean(snapshot.isContinuous);
  const validToTime = toIsoTime(snapshot.validToTime) || (isContinuous ? validFromTime : "");
  const isOpenEnded = Boolean(snapshot.isOpenEnded);
  const validToDate = normalizeDateIso(snapshot.validToDate)
    || (isOpenEnded ? computeOpenEndedHorizonEndDate(validFromDate) : "");
  if (!validFromDate || !validFromTime || !validToDate || !validToTime) return null;
  return {
    version: 1,
    validFromDate,
    validFromTime,
    validToDate,
    validToTime,
    isContinuous,
    isOpenEnded,
    requestDate: normalizeDateIso(snapshot.requestDate) || "",
    requestTime: toIsoTime(snapshot.requestTime) || "",
    lines: Array.isArray(snapshot.lines)
      ? snapshot.lines.map((line, index) => ({
        id: String(line.id || `line-${index + 1}`),
        label: String(line.label || `Ligne ${index + 1}`),
        anchorDate: normalizeDateIso(line.anchorDate),
        startTime: toIsoTime(line.startTime),
        endTime: toIsoTime(line.endTime),
        weekdaysMask: Number.isFinite(Number(line.weekdaysMask)) ? Number(line.weekdaysMask) : 127,
        includeHolidays: Boolean(line.includeHolidays),
        includeHolidayEves: Boolean(line.includeHolidayEves)
      })).filter((line) => line.startTime && line.endTime)
      : []
  };
}

/**
 * @param {object|null} snapshot
 * @returns {boolean}
 */
function isPonctuelPlanningSnapshot(snapshot) {
  if (!snapshot || snapshot.isContinuous) return false;
  return Array.isArray(snapshot.lines)
    && snapshot.lines.length === 1
    && snapshot.lines[0]?.id === "ponctuel-slot";
}

/**
 * @param {object} slot
 * @param {object} closedRow
 * @returns {boolean}
 */
function slotConflictsWithClosedRow(slot, closedRow) {
  const closedStart = String(closedRow.planning_slot_start || "").trim();
  const closedEnd = String(closedRow.planning_slot_end || "").trim();
  if (closedStart && closedEnd) return slot.startIso < closedEnd && closedStart < slot.endIso;
  return String(closedRow.recurrence_start_date || "") === slot.startDate
    && String(closedRow.start_time || "") === slot.startTime
    && String(closedRow.end_time || "") === slot.endTime;
}

/**
 * Écarte les créneaux qui recouvrent une ligne déjà clôturée (régénération de lot).
 *
 * @param {object[]} slots
 * @param {object[]} closedRows
 * @returns {object[]}
 */
function filterSlotsPreservingClosed(slots, closedRows) {
  const closed = Array.isArray(closedRows) ? closedRows : [];
  return closed.length
    ? slots.filter((slot) => !closed.some((row) => slotConflictsWithClosedRow(slot, row)))
    : slots;
}

/**
 * Parse le snapshot de planification d'une ligne SQL (`jsonb` ou texte).
 *
 * @param {unknown} raw
 * @returns {object|null}
 */
function parsePlanningSnapshotJson(raw) {
  try {
    const snapshot = raw && typeof raw === "object" ? raw : JSON.parse(String(raw || ""));
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
    return Number(snapshot.version) === 1 ? snapshot : null;
  } catch {
    return null;
  }
}

/**
 * H24 jusqu'à nouvel ordre : pas de clôture tant qu'une date de fin n'est pas enregistrée.
 *
 * @param {object|null} snapshot
 * @returns {boolean}
 */
function isOpenEndedContinuousSnapshot(snapshot) {
  return Boolean(snapshot?.isOpenEnded && snapshot?.isContinuous);
}

/**
 * Instant (ms) depuis un horodatage ISO (`AAAA-MM-JJTHH:mm` ou avec secondes).
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function parseIsoDateTimeMs(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const timestamp = new Date(raw.length === 16 ? `${raw}:00` : raw).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
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
 * @param {object} row - Ligne SQL
 * @returns {number|null}
 */
function resolveSlotEndMs(row) {
  const fromSlot = parseIsoDateTimeMs(row?.planning_slot_end);
  if (fromSlot != null) return fromSlot;
  const activeDate = normalizeDateIso(row.recurrence_start_date);
  const endTime = toIsoTime(row.end_time);
  if (!activeDate || !endTime) return null;
  const endDate = row.crosses_midnight
    ? addDaysIso(activeDate, 1)
    : (normalizeDateIso(row.recurrence_end_date) || activeDate);
  if (!endDate) return null;
  return parseIsoDateTimeMs(`${endDate}T${endTime}`);
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
  computeOpenEndedHorizonEndDate,
  filterSlotsPreservingClosed,
  GARDIENNAGE_AUTO_CLOSE_GRACE_DAYS,
  GARDIENNAGE_OPEN_ENDED_HORIZON_DAYS,
  isAutoCloseDue,
  isManualCloseAllowed,
  isOpenEndedContinuousRow,
  isOpenEndedContinuousSnapshot,
  isPonctuelPlanningSnapshot,
  normalizePlanningSnapshot,
  OPEN_STATUSES_SQL,
  parseIsoDateTimeMs,
  parsePlanningSnapshotJson,
  resolveSlotEndMs,
  resolveSystemActor,
  toIsoTime,
  validatePlanningLinesNoOverlap
};
