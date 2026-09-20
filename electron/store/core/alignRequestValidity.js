/**
 * Moteur d’alignement demande / début de validité.
 *
 * Invariant : demande ≤ Validité Du.
 * Si la validité était encore collée à la demande, un recul de demande entraîne le Du.
 * Une validité déjà plus tardive n’est pas ramenée. Un Au n’est poussé que s’il passe avant le Du.
 *
 * Chargé par Electron (`require`) et par l’UI Vite (`import`). Pas de dépendance Node.
 *
 * @module electron/store/core/alignRequestValidity
 */

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * @typedef {object} RequestValidityRange
 * @property {string} requestDate
 * @property {string} requestTime
 * @property {string} validFromDate
 * @property {string} validFromTime
 * @property {string} validToDate
 * @property {string} validToTime
 */

/**
 * @typedef {object} AlignRequestValidityOptions
 * @property {boolean} [validityHasTime=true] - Comparer date+heure (false = date seule).
 * @property {boolean} [compareEndTimes=true] - Corriger aussi l’heure de fin si Au < Du.
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
function trimStr(value) {
  return String(value || "").trim();
}

/**
 * @param {string} dateIso
 * @returns {boolean}
 */
function isIsoDate(dateIso) {
  return ISO_DAY_RE.test(dateIso);
}

/**
 * @param {string} time
 * @param {string} fallback
 * @returns {string}
 */
function normalizeHm(time, fallback) {
  const t = trimStr(time);
  return TIME_HM_RE.test(t) ? t : fallback;
}

/**
 * @param {string} dateIso
 * @param {string} hhmm
 * @returns {number|null}
 */
function parseDateTimeMs(dateIso, hhmm) {
  if (!isIsoDate(dateIso) || !TIME_HM_RE.test(hhmm)) return null;
  const ms = new Date(`${dateIso}T${hhmm}:00`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * @param {AlignRequestValidityOptions} [opts]
 * @returns {{ validityHasTime: boolean, compareEndTimes: boolean }}
 */
function resolveOpts(opts) {
  return {
    validityHasTime: opts?.validityHasTime !== false,
    compareEndTimes: opts?.compareEndTimes !== false
  };
}

/**
 * @param {RequestValidityRange} state
 * @param {{ validityHasTime: boolean }} opts
 * @returns {boolean}
 */
function isCoupled(state, opts) {
  const reqDate = trimStr(state.requestDate);
  const fromDate = trimStr(state.validFromDate);
  if (!isIsoDate(reqDate) || !isIsoDate(fromDate) || reqDate !== fromDate) return false;
  if (!opts.validityHasTime) return true;
  const fromTime = trimStr(state.validFromTime);
  if (!fromTime) return true;
  return normalizeHm(state.requestTime, "00:00") === normalizeHm(fromTime, "00:00");
}

/**
 * @param {RequestValidityRange} state
 * @param {{ validityHasTime: boolean }} opts
 * @returns {boolean}
 */
function isRequestAfterValidFrom(state, opts) {
  const reqDate = trimStr(state.requestDate);
  const fromDate = trimStr(state.validFromDate);
  if (!isIsoDate(reqDate) || !isIsoDate(fromDate)) return false;
  if (!opts.validityHasTime) return reqDate > fromDate;
  const reqMs = parseDateTimeMs(reqDate, normalizeHm(state.requestTime, "00:00"));
  const fromMs = parseDateTimeMs(fromDate, normalizeHm(state.validFromTime, "00:00"));
  if (reqMs == null || fromMs == null) return false;
  return reqMs > fromMs;
}

/**
 * @param {RequestValidityRange} state
 * @param {{ validityHasTime: boolean, compareEndTimes: boolean }} opts
 * @returns {RequestValidityRange}
 */
function ensureValidToNotBeforeFrom(state, opts) {
  const fromDate = trimStr(state.validFromDate);
  const toDate = trimStr(state.validToDate);
  if (!isIsoDate(fromDate) || !isIsoDate(toDate)) return state;
  if (toDate < fromDate) {
    return { ...state, validToDate: fromDate };
  }
  if (!opts.compareEndTimes || !opts.validityHasTime) return state;
  const fromMs = parseDateTimeMs(fromDate, normalizeHm(state.validFromTime, "00:00"));
  const toMs = parseDateTimeMs(toDate, normalizeHm(state.validToTime, "23:59"));
  if (fromMs == null || toMs == null || toMs >= fromMs) return state;
  return {
    ...state,
    validToDate: fromDate,
    validToTime: normalizeHm(state.validFromTime, "00:00")
  };
}

/**
 * Plafond moteur : si la demande est après le Du, le Du devient la demande.
 *
 * @param {RequestValidityRange} state
 * @param {AlignRequestValidityOptions} [opts]
 * @returns {RequestValidityRange}
 */
function floorValidityStartToRequest(state, opts) {
  const resolved = resolveOpts(opts);
  if (!isRequestAfterValidFrom(state, resolved)) {
    return ensureValidToNotBeforeFrom(state, resolved);
  }
  const next = {
    ...state,
    validFromDate: trimStr(state.requestDate),
    validFromTime: resolved.validityHasTime
      ? (trimStr(state.requestTime) || state.validFromTime)
      : state.validFromTime
  };
  return ensureValidToNotBeforeFrom(next, resolved);
}

/**
 * Changement de date/heure de demande (formulaire).
 *
 * @param {RequestValidityRange} state
 * @param {{ date: string, time: string }} nextRequest
 * @param {AlignRequestValidityOptions} [opts]
 * @returns {RequestValidityRange}
 */
function applyRequestDateTimeChange(state, nextRequest, opts) {
  const resolved = resolveOpts(opts);
  const coupled = isCoupled(state, resolved);
  const next = {
    ...state,
    requestDate: trimStr(nextRequest?.date),
    requestTime: trimStr(nextRequest?.time)
  };
  if (!coupled && !isRequestAfterValidFrom(next, resolved)) {
    return next;
  }
  const moved = {
    ...next,
    validFromDate: next.requestDate,
    validFromTime: resolved.validityHasTime
      ? (next.requestTime || state.validFromTime)
      : state.validFromTime
  };
  return ensureValidToNotBeforeFrom(moved, resolved);
}

/**
 * Changement de début de validité (formulaire) : jamais avant la demande.
 *
 * @param {RequestValidityRange} state
 * @param {{ date: string, time?: string }} nextFrom
 * @param {AlignRequestValidityOptions} [opts]
 * @returns {RequestValidityRange}
 */
function applyValidFromDateTimeChange(state, nextFrom, opts) {
  const resolved = resolveOpts(opts);
  let next = {
    ...state,
    validFromDate: trimStr(nextFrom?.date),
    validFromTime: resolved.validityHasTime
      ? trimStr(nextFrom?.time ?? state.validFromTime)
      : state.validFromTime
  };
  if (isRequestAfterValidFrom(next, resolved) && isIsoDate(trimStr(state.requestDate))) {
    next = {
      ...next,
      validFromDate: trimStr(state.requestDate),
      validFromTime: resolved.validityHasTime
        ? (trimStr(state.requestTime) || next.validFromTime)
        : next.validFromTime
    };
  }
  return ensureValidToNotBeforeFrom(next, resolved);
}

module.exports = {
  applyRequestDateTimeChange,
  applyValidFromDateTimeChange,
  floorValidityStartToRequest,
  isRequestAfterValidFrom: (state, opts) => isRequestAfterValidFrom(state, resolveOpts(opts))
};
