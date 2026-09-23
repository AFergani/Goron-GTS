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

/**
 * Date ISO `AAAA-MM-JJ` en `JJ/MM/AAAA` pour les messages de clôture.
 *
 * @param {unknown} iso
 * @returns {string}
 */
function formatPassageDateFr(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "").trim());
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

/**
 * Refuse la clôture d'une ronde contractuelle trop tôt ou incomplète.
 *
 * Le compte-rendu et les heures d'arrivée / départ sont exigés, et seulement
 * une fois l'heure de passage prévue dépassée.
 *
 * @param {import('../../../userStore')} store
 * @param {string} source - Canal d'erreur (`ronde:create` ou `ronde:status`).
 * @param {object} row
 * @returns {void}
 */
function assertPlannedClosureAllowed(store, source, row) {
  const kind = String(row.source || "").trim().toUpperCase();
  if (kind !== "PLANIFIE") return;
  if (!isPassagePast(row)) {
    const when = formatPassageDateFr(row.request_date || row.requestDate);
    store.fail(
      source,
      when
        ? `Cette ronde est prévue le ${when}. La clôture n'est possible qu'une fois l'heure de passage passée.`
        : "La clôture n'est possible qu'une fois l'heure de passage passée.",
      "RONDE_CLOSE_TOO_EARLY"
    );
  }
  if (!String(row.report || "").trim()) {
    store.fail(source, "Le compte rendu est obligatoire avant clôture.", "RONDE_CLOSE_REPORT_REQUIRED");
  }
  const arrival = String(row.arrival_time || row.arrivalTime || "").trim();
  const departure = String(row.departure_time || row.departureTime || "").trim();
  if (!arrival || !departure) {
    store.fail(
      source,
      "Les heures d'arrivée et de départ sont obligatoires avant clôture.",
      "RONDE_CLOSE_TIMES_REQUIRED"
    );
  }
}

module.exports = {
  TIME_RE,
  extractRequestedTimeHm,
  isPassagePast,
  hasKnownTerrainData,
  isBatchFullyPast,
  isRondeManagerRole,
  assertPlannedClosureAllowed
};
