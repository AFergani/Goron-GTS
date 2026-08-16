/**
 * Validation synchrone des dates, heures et payloads Intervention.
 *
 * @module electron/store/domains/intervention/helpers
 */

/** @param {unknown} value @returns {string} Date ISO valide ou chaîne vide. */
function toIsoDate(value) {
  const raw = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

/** @param {unknown} value @returns {string} Heure HH:mm valide ou chaîne vide. */
function toIsoTime(value) {
  const raw = String(value || "").trim();
  return /^\d{2}:\d{2}$/.test(raw) ? raw : "";
}

/** @param {string} dateIso @param {string} timeIso @returns {number|null} */
function parseDateTimeMs(dateIso, timeIso) {
  if (!dateIso || !timeIso) return null;
  const ms = Date.parse(`${dateIso}T${timeIso}:00`);
  return Number.isFinite(ms) ? ms : null;
}

/** @param {object} values @returns {number|null} Écart demande-arrivée en minutes. */
function computeDelayMinutes({ requestDate, requestTime, arrivalDate, arrivalTime }) {
  if (!requestDate || !requestTime || !arrivalTime) return null;
  const startMs = parseDateTimeMs(requestDate, requestTime);
  const arrivalBase = toIsoDate(arrivalDate) || requestDate;
  let arrivalMs = parseDateTimeMs(arrivalBase, arrivalTime);
  if (startMs == null || arrivalMs == null) return null;
  if (!toIsoDate(arrivalDate) && arrivalMs < startMs) arrivalMs += 86400000;
  return Math.round((arrivalMs - startMs) / 60000);
}

/** @param {object} values @returns {string|null} Date civile de départ. */
function computeDepartureDate({ requestDate, requestTime, arrivalDate, arrivalTime, departureDate, departureTime }) {
  const explicit = toIsoDate(departureDate);
  if (explicit) return explicit;
  if (!requestDate || !requestTime || !departureTime) return null;
  let departureMs = parseDateTimeMs(requestDate, departureTime);
  if (departureMs == null) return null;
  const referenceMs = arrivalTime
    ? parseDateTimeMs(toIsoDate(arrivalDate) || requestDate, arrivalTime)
    : parseDateTimeMs(requestDate, requestTime);
  if (referenceMs == null) return null;
  if (departureMs < referenceMs) departureMs += 86400000;
  return new Date(departureMs).toISOString().slice(0, 10);
}

/** @param {import('../../../userStore')} store @param {object} values @returns {void} */
function assertPassageDateTimesCoherent(store, { arrivalDate, arrivalTime, departureDate, departureTime }) {
  const arrivalDateIso = toIsoDate(arrivalDate);
  const departureDateIso = toIsoDate(departureDate);
  const arrivalTimeIso = toIsoTime(arrivalTime);
  const departureTimeIso = toIsoTime(departureTime);
  if (arrivalTimeIso && !arrivalDateIso) {
    store.fail("intervention:validate", "La date d'arrivée est obligatoire lorsque l'heure d'arrivée est renseignée.", "INTERVENTION_ARRIVAL_DATE_REQUIRED");
  }
  if (departureTimeIso && !departureDateIso) {
    store.fail("intervention:validate", "La date de départ est obligatoire lorsque l'heure de départ est renseignée.", "INTERVENTION_DEPARTURE_DATE_REQUIRED");
  }
  if (arrivalDateIso && arrivalTimeIso && departureDateIso && departureTimeIso) {
    const arrivalMs = parseDateTimeMs(arrivalDateIso, arrivalTimeIso);
    const departureMs = parseDateTimeMs(departureDateIso, departureTimeIso);
    if (arrivalMs != null && departureMs != null && departureMs < arrivalMs) {
      store.fail("intervention:validate", "La date et l'heure de départ doivent être postérieures à l'arrivée.", "INTERVENTION_DEPARTURE_BEFORE_ARRIVAL");
    }
  }
}

/** @param {object} row @returns {string[]} Champs obligatoires manquants à la clôture. */
function getMissingClosureFieldsFromRow(row) {
  const missing = [];
  if (!toIsoTime(row.arrival_time)) missing.push("heure d'arrivée");
  if (!toIsoTime(row.departure_time)) missing.push("heure de départ");
  if (!String(row.work_order_number || "").trim()) missing.push("N° du bon d'intervention");
  if (!String(row.report || "").trim()) missing.push("compte-rendu");
  return missing;
}

/**
 * Valide et normalise une fiche Intervention.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @param {{requireArrival?: boolean, requireDeparture?: boolean}} [options]
 * @returns {object}
 */
function ensureInterventionPayload(store, payload, { requireArrival = false, requireDeparture = false } = {}) {
  const requestDate = toIsoDate(payload.requestDate);
  const requestTime = toIsoTime(payload.requestTime);
  const arrivalDate = toIsoDate(payload.arrivalDate);
  const arrivalTime = toIsoTime(payload.arrivalTime);
  const departureDateInput = toIsoDate(payload.departureDate);
  const departureTime = toIsoTime(payload.departureTime);
  const requestReason = String(payload.requestReason || "").trim();
  const siteDisplay = String(payload.siteDisplay || "").trim();
  const intervenantName = String(payload.intervenantName || "").trim();
  if (!requestDate) store.fail("intervention:validate", "La date de demande est obligatoire.", "INTERVENTION_REQUEST_DATE_REQUIRED");
  if (!requestTime) store.fail("intervention:validate", "L'heure de demande est obligatoire.", "INTERVENTION_REQUEST_TIME_REQUIRED");
  if (!siteDisplay) store.fail("intervention:validate", "Le site est obligatoire.", "INTERVENTION_SITE_REQUIRED");
  if (!requestReason) store.fail("intervention:validate", "Le motif est obligatoire.", "INTERVENTION_REASON_REQUIRED");
  if (!intervenantName) store.fail("intervention:validate", "Le prestataire est obligatoire.", "INTERVENTION_PRESTATAIRE_REQUIRED");
  if (requireArrival && !arrivalTime) store.fail("intervention:validate", "L'heure d'arrivée est obligatoire.", "INTERVENTION_ARRIVAL_REQUIRED");
  if (requireDeparture && !departureTime) store.fail("intervention:validate", "L'heure de départ est obligatoire.", "INTERVENTION_DEPARTURE_REQUIRED");
  const resolvedArrivalDate = arrivalTime ? arrivalDate || requestDate : null;
  const resolvedDepartureDate = departureTime
    ? departureDateInput || computeDepartureDate({ requestDate, requestTime, arrivalDate: resolvedArrivalDate, arrivalTime, departureDate: departureDateInput, departureTime })
    : null;
  assertPassageDateTimesCoherent(store, { arrivalDate: resolvedArrivalDate, arrivalTime, departureDate: resolvedDepartureDate, departureTime });
  const delayMinutes = computeDelayMinutes({ requestDate, requestTime, arrivalDate: resolvedArrivalDate, arrivalTime });
  if (arrivalTime && delayMinutes == null) store.fail("intervention:validate", "L'heure d'arrivée est incohérente.", "INTERVENTION_ARRIVAL_INVALID");
  if (delayMinutes != null && delayMinutes < 0) {
    store.fail("intervention:validate", "La date et l'heure de la demande ne peuvent pas être postérieures à l'arrivée.", "INTERVENTION_REQUEST_AFTER_ARRIVAL");
  }
  if (departureTime && !resolvedDepartureDate) store.fail("intervention:validate", "L'heure de départ est incohérente.", "INTERVENTION_DEPARTURE_INVALID");
  return {
    siteId: payload.siteId || null, siteDisplay, requestReason, requestDate, requestTime,
    arrivalDate: resolvedArrivalDate, arrivalTime, departureTime, departureDate: resolvedDepartureDate,
    delayMinutes, workOrderNumber: String(payload.workOrderNumber || "").trim(),
    report: String(payload.report || "").trim(), intervenantId: payload.intervenantId || null, intervenantName
  };
}

module.exports = { toIsoDate, toIsoTime, computeDelayMinutes, computeDepartureDate, ensureInterventionPayload, getMissingClosureFieldsFromRow };
