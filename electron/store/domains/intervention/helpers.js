/**
 * Validation synchrone des dates, heures et payloads Intervention.
 *
 * Aucun accès base. Appelé par `entries.js`.
 * Clôture : heure d'arrivée, heure de départ, compte-rendu.
 * N° de bon optionnel (repli « Pas de bon »). Annulation : passage non exigé.
 * `EN_COURS` : saisie partielle.
 *
 * @module electron/store/domains/intervention/helpers
 */

const { addDaysIso, normalizeDateIso, normalizeTimeHm } = require("../../core/isoDate");

/** Libellé affiché / enregistré lorsqu'aucun bon n'est saisi. */
const INTERVENTION_NO_WORK_ORDER_LABEL = "Pas de bon";

/**
 * Normalise le N° de bon : vide ou déjà « Pas de bon » → libellé unique.
 *
 * @param {unknown} value - Saisie opérateur ou valeur SQL
 * @returns {string} Numéro saisi, ou `Pas de bon`
 */
function resolveWorkOrderNumber(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed === INTERVENTION_NO_WORK_ORDER_LABEL) return INTERVENTION_NO_WORK_ORDER_LABEL;
  return trimmed;
}

/**
 * @param {string} dateIso
 * @param {string} timeIso
 * @returns {number|null}
 */
function parseDateTimeMs(dateIso, timeIso) {
  const date = normalizeDateIso(dateIso);
  const time = normalizeTimeHm(timeIso);
  if (!date || !time) return null;
  const ms = Date.parse(`${date}T${time}:00`);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * @param {unknown} value
 * @returns {number} Minutes depuis minuit, ou -1.
 */
function timeToMinutes(value) {
  const hhmm = normalizeTimeHm(value);
  if (!hhmm) return -1;
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Date civile d'un horaire : date explicite, sinon jour de base, ou lendemain si l'heure est avant la référence
 * (passage minuit, aligné UI `inferArrivalDateFromEntry` / `inferDepartureDateFromEntry`).
 *
 * @param {string} baseDate
 * @param {string} baseTime
 * @param {string} eventTime
 * @param {unknown} explicitDate
 * @returns {string}
 */
function inferCivilDate(baseDate, baseTime, eventTime, explicitDate) {
  const explicit = normalizeDateIso(explicitDate);
  if (explicit) return explicit;
  const base = normalizeDateIso(baseDate);
  if (!base || !normalizeTimeHm(eventTime)) return "";
  const baseMin = timeToMinutes(baseTime);
  const eventMin = timeToMinutes(eventTime);
  if (baseMin >= 0 && eventMin >= 0 && eventMin < baseMin) {
    return addDaysIso(base, 1) || base;
  }
  return base;
}

/**
 * Écart demande → arrivée en minutes, ou `null` si indéterminable.
 *
 * @param {{ requestDate: string, requestTime: string, arrivalDate: string, arrivalTime: string }} values
 * @returns {number|null}
 */
function computeDelayMinutes({ requestDate, requestTime, arrivalDate, arrivalTime }) {
  const startMs = parseDateTimeMs(requestDate, requestTime);
  const arrivalMs = parseDateTimeMs(arrivalDate, arrivalTime);
  if (startMs == null || arrivalMs == null) return null;
  return Math.round((arrivalMs - startMs) / 60000);
}

/**
 * @param {import('../../../userStore')} store
 * @param {object} values
 * @returns {void}
 */
function assertPassageDateTimesCoherent(store, { arrivalDate, arrivalTime, departureDate, departureTime }) {
  const arrivalDateIso = normalizeDateIso(arrivalDate);
  const departureDateIso = normalizeDateIso(departureDate);
  const arrivalTimeIso = normalizeTimeHm(arrivalTime);
  const departureTimeIso = normalizeTimeHm(departureTime);
  if (arrivalTimeIso && !arrivalDateIso) {
    store.fail(
      "intervention:validate",
      "La date d'arrivée est obligatoire lorsque l'heure d'arrivée est renseignée.",
      "INTERVENTION_ARRIVAL_DATE_REQUIRED"
    );
  }
  if (departureTimeIso && !departureDateIso) {
    store.fail(
      "intervention:validate",
      "La date de départ est obligatoire lorsque l'heure de départ est renseignée.",
      "INTERVENTION_DEPARTURE_DATE_REQUIRED"
    );
  }
  if (arrivalDateIso && arrivalTimeIso && departureDateIso && departureTimeIso) {
    const arrivalMs = parseDateTimeMs(arrivalDateIso, arrivalTimeIso);
    const departureMs = parseDateTimeMs(departureDateIso, departureTimeIso);
    if (arrivalMs != null && departureMs != null && departureMs < arrivalMs) {
      store.fail(
        "intervention:validate",
        "La date et l'heure de départ doivent être postérieures à l'arrivée.",
        "INTERVENTION_DEPARTURE_BEFORE_ARRIVAL"
      );
    }
  }
}

/**
 * Champs de passage exigés pour clôturer (pas pour une annulation).
 * N° de bon : optionnel.
 *
 * @param {object} values - Ligne SQL ou payload normalisé
 * @returns {string[]}
 */
function getMissingClosureFields(values) {
  const missing = [];
  if (!normalizeTimeHm(values.arrivalTime ?? values.arrival_time)) missing.push("heure d'arrivée");
  if (!normalizeTimeHm(values.departureTime ?? values.departure_time)) missing.push("heure de départ");
  if (!String(values.report || "").trim()) missing.push("compte-rendu");
  return missing;
}

/**
 * @param {object} row - Ligne SQL
 * @returns {string[]}
 */
function getMissingClosureFieldsFromRow(row) {
  return getMissingClosureFields(row);
}

/**
 * Valide et normalise une fiche Intervention.
 * `EN_COURS` : saisie partielle autorisée. Clôture : arrivée, départ, compte-rendu.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {object}
 */
function ensureInterventionPayload(store, payload) {
  const requestDate = normalizeDateIso(payload.requestDate);
  const requestTime = normalizeTimeHm(payload.requestTime);
  const arrivalTime = normalizeTimeHm(payload.arrivalTime);
  const departureTime = normalizeTimeHm(payload.departureTime);
  const requestReason = String(payload.requestReason || "").trim();
  const siteDisplay = String(payload.siteDisplay || "").trim();
  const intervenantName = String(payload.intervenantName || "").trim();
  if (!requestDate) {
    store.fail("intervention:validate", "La date de demande est obligatoire.", "INTERVENTION_REQUEST_DATE_REQUIRED");
  }
  if (!requestTime) {
    store.fail("intervention:validate", "L'heure de demande est obligatoire.", "INTERVENTION_REQUEST_TIME_REQUIRED");
  }
  if (!siteDisplay) store.fail("intervention:validate", "Le site est obligatoire.", "INTERVENTION_SITE_REQUIRED");
  if (!requestReason) store.fail("intervention:validate", "Le motif est obligatoire.", "INTERVENTION_REASON_REQUIRED");
  if (!intervenantName) {
    store.fail("intervention:validate", "Le prestataire est obligatoire.", "INTERVENTION_PRESTATAIRE_REQUIRED");
  }
  const resolvedArrivalDate = arrivalTime
    ? inferCivilDate(requestDate, requestTime, arrivalTime, payload.arrivalDate)
    : null;
  const resolvedDepartureDate = departureTime
    ? inferCivilDate(
      resolvedArrivalDate || requestDate,
      arrivalTime || requestTime,
      departureTime,
      payload.departureDate
    )
    : null;
  assertPassageDateTimesCoherent(store, {
    arrivalDate: resolvedArrivalDate,
    arrivalTime,
    departureDate: resolvedDepartureDate,
    departureTime
  });
  const delayMinutes = arrivalTime
    ? computeDelayMinutes({
      requestDate,
      requestTime,
      arrivalDate: resolvedArrivalDate,
      arrivalTime
    })
    : null;
  if (arrivalTime && delayMinutes == null) {
    store.fail("intervention:validate", "L'heure d'arrivée est incohérente.", "INTERVENTION_ARRIVAL_INVALID");
  }
  if (delayMinutes != null && delayMinutes < 0) {
    store.fail(
      "intervention:validate",
      "La date et l'heure de la demande ne peuvent pas être postérieures à l'arrivée.",
      "INTERVENTION_REQUEST_AFTER_ARRIVAL"
    );
  }
  return {
    siteId: String(payload.siteId || "").trim() || null,
    siteDisplay,
    requestReason,
    requestDate,
    requestTime,
    arrivalDate: resolvedArrivalDate,
    arrivalTime,
    departureTime,
    departureDate: resolvedDepartureDate,
    delayMinutes,
    workOrderNumber: resolveWorkOrderNumber(payload.workOrderNumber),
    report: String(payload.report || "").trim(),
    intervenantId: String(payload.intervenantId || "").trim() || null,
    intervenantName
  };
}

module.exports = {
  ensureInterventionPayload,
  getMissingClosureFieldsFromRow,
  resolveWorkOrderNumber
};
