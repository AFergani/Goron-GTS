/**
 * Helpers passage / terrain pour annulation et suppression de lots exceptionnels.
 *
 * @module electron/store/domains/ronde/passageRules
 */

const { parsePlanningSnapshot } = require("./mapping");

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * @param {object} row
 * @returns {string} HH:mm
 */
function extractRequestedTimeHm(row) {
  const obs = String(row.horaires_demande_obs || row.horairesDemandeObs || "");
  const fromObs = /Heure demandée:\s*([01]\d|2[0-3]):([0-5]\d)/i.exec(obs);
  if (fromObs) return `${fromObs[1]}:${fromObs[2]}`;
  const snap = parsePlanningSnapshot(row.request_planning_snapshot_json ?? row.requestPlanningSnapshotJson);
  if (snap?.lines && Array.isArray(snap.lines)) {
    for (const ln of snap.lines) {
      const t = String(ln?.requestedTime || "").trim();
      if (TIME_RE.test(t)) return t;
    }
  }
  const rt = String(snap?.requestTime || "").trim();
  if (TIME_RE.test(rt)) return rt;
  return "00:00";
}

/**
 * @param {object} row
 * @param {number} [nowMs]
 * @returns {boolean}
 */
function isPassagePast(row, nowMs = Date.now()) {
  const date = String(row.request_date || row.requestDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const time = extractRequestedTimeHm(row);
  const ms = Date.parse(`${date}T${time}:00`);
  return Number.isFinite(ms) && ms < nowMs;
}

/**
 * @param {object} row
 * @returns {boolean}
 */
function hasKnownTerrainData(row) {
  const status = String(row.status || "").trim().toUpperCase();
  if (status === "CLOTURE") return true;
  return Boolean(
    String(row.arrival_time || row.arrivalTime || "").trim() ||
      String(row.departure_time || row.departureTime || "").trim() ||
      String(row.work_order_number || row.workOrderNumber || "").trim() ||
      String(row.report || "").trim()
  );
}

/**
 * Lot « après » = tous les passages du lot sont déjà passés.
 * @param {object[]} rows
 * @param {number} [nowMs]
 * @returns {boolean}
 */
function isBatchFullyPast(rows, nowMs = Date.now()) {
  if (!rows.length) return false;
  return rows.every((row) => isPassagePast(row, nowMs));
}

/**
 * @param {string} requesterRole
 * @returns {boolean}
 */
function isRondeManagerRole(requesterRole) {
  return requesterRole === "RESPONSABLE" || requesterRole === "DEV";
}

module.exports = {
  TIME_RE,
  extractRequestedTimeHm,
  isPassagePast,
  hasKnownTerrainData,
  isBatchFullyPast,
  isRondeManagerRole
};
