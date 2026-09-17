/**
 * Noyau unique de calcul des horaires de ronde (contractuel et exceptionnel).
 *
 * Règles : ouverture / fermeture / accompagnement dédiés ; fréquence ancrée
 * après la fermeture et arrêtée avant l’ouverture ; nombre de rondes réparti
 * dans la tranche sans rejouer ces horaires.
 *
 * Chargé par Electron (`require`) et par l’UI Vite (import). Pas de dépendance Node.
 *
 * @module electron/store/domains/ronde/slotTimeKernel
 */

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_HONORED_RANDOM_SLOTS = 48;

/**
 * @param {Date} d
 * @returns {string}
 */
function formatLocalDateIso(d) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

/**
 * @param {string} dateIso
 * @param {number} deltaDays
 * @returns {string}
 */
function addDaysIso(dateIso, deltaDays) {
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateIso;
  d.setDate(d.getDate() + deltaDays);
  return formatLocalDateIso(d);
}

/**
 * @param {string} dateIso
 * @param {string} hhmm
 * @returns {number|null}
 */
function parseDateTimeSafeMs(dateIso, hhmm) {
  const d = new Date(`${String(dateIso || "").trim()}T${String(hhmm || "").trim()}:00`);
  const ms = d.getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * @param {string} time
 * @returns {number}
 */
function timeToMinutes(time) {
  const value = String(time || "").trim();
  if (!TIME_RE.test(value)) return 0;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * @param {string} startHHMM
 * @param {string} endHHMM
 * @returns {boolean}
 */
function windowCrossesMidnight(startHHMM, endHHMM) {
  return timeToMinutes(endHHMM) <= timeToMinutes(startHHMM);
}

/**
 * @param {Array<{ kind: string, ms: number }>} dedicated
 * @param {number} rangeStartMs
 * @param {number} rangeEndMs
 * @returns {Array<{ kind: string, ms: number }>}
 */
function dedicatedInRange(dedicated, rangeStartMs, rangeEndMs) {
  return (Array.isArray(dedicated) ? dedicated : []).filter((d) => d.ms >= rangeStartMs && d.ms <= rangeEndMs);
}

/**
 * @param {number} ms
 * @returns {{ requestDate: string, requestedTime: string }}
 */
function slotFromMs(ms) {
  const cursor = new Date(ms);
  return {
    requestDate: formatLocalDateIso(cursor),
    requestedTime: `${String(cursor.getHours()).padStart(2, "0")}:${String(cursor.getMinutes()).padStart(2, "0")}`
  };
}

/**
 * @param {Array<{ kind: string, ms: number }>} dedicated
 * @returns {number|null}
 */
function firstClosingMs(dedicated) {
  const closings = dedicated.filter((d) => d.kind === "CLOSING").sort((a, b) => a.ms - b.ms);
  return closings[0] ? closings[0].ms : null;
}

/**
 * @param {Array<{ kind: string, ms: number }>} dedicated
 * @param {number|null} closingMs
 * @returns {number|null}
 */
function firstOpeningAfterCloseMs(dedicated, closingMs) {
  const openings = dedicated.filter((d) => d.kind === "OPENING").sort((a, b) => a.ms - b.ms);
  const found = openings.find((o) => closingMs == null || o.ms > closingMs);
  return found ? found.ms : null;
}

/**
 * @param {number} spanMin
 * @param {number} count
 * @param {boolean} excludeStart
 * @param {boolean} excludeEnd
 * @returns {number[]}
 */
function evenSpreadMinuteOffsets(spanMin, count, excludeStart, excludeEnd) {
  const n = Math.max(1, Math.round(count));
  if (spanMin < 0 || n < 1) return [];
  if (!excludeStart && !excludeEnd) {
    if (n === 1) return [0];
    const out = [];
    for (let i = 0; i < n; i += 1) out.push(Math.round((i * spanMin) / (n - 1)));
    return out;
  }
  if (excludeStart && excludeEnd) {
    if (spanMin <= 1) return [];
    if (n === 1) return [Math.round(spanMin / 2)];
    const out = [];
    for (let i = 0; i < n; i += 1) out.push(Math.round(((i + 1) * spanMin) / (n + 1)));
    return out;
  }
  if (excludeStart && !excludeEnd) {
    if (n === 1) return [spanMin];
    const out = [];
    for (let i = 0; i < n; i += 1) out.push(Math.round(((i + 1) * spanMin) / n));
    return out;
  }
  if (n === 1) return [0];
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(Math.round((i * spanMin) / n));
  return out;
}

/**
 * Parcourt la plage par pas d’intervalle en honorant ouverture / fermeture.
 *
 * @param {{ validityStartMs: number, validityEndMs: number, intervalMinutes: number, dedicated: Array<{ kind: string, ms: number }> }} params
 * @returns {Array<{ requestDate: string, requestedTime: string }>}
 */
function walkIntervalHonoringOpeningClosing(params) {
  const intervalMinutes = Math.max(1, Math.round(Number(params.intervalMinutes) || 0));
  if (!Number.isFinite(intervalMinutes) || params.validityEndMs < params.validityStartMs) {
    return [];
  }
  const list = Array.isArray(params.dedicated) ? params.dedicated : [];
  const dedicatedMs = new Set(list.map((d) => d.ms));
  const closingMs = firstClosingMs(list);
  let cursor = new Date(params.validityStartMs);
  if (closingMs != null) {
    cursor = new Date(closingMs);
    cursor.setMinutes(cursor.getMinutes() + intervalMinutes);
  }
  const exclusiveEndMs = firstOpeningAfterCloseMs(list, closingMs);
  const out = [];
  let safety = 0;
  while (safety < 2000 && out.length < MAX_HONORED_RANDOM_SLOTS) {
    safety += 1;
    const t = cursor.getTime();
    if (Number.isNaN(t) || t > params.validityEndMs) break;
    if (exclusiveEndMs != null && t >= exclusiveEndMs) break;
    if (t >= params.validityStartMs && !dedicatedMs.has(t)) {
      out.push(slotFromMs(t));
    }
    cursor.setMinutes(cursor.getMinutes() + intervalMinutes);
  }
  return out;
}

/**
 * Répartit N rondes dans la plage hors ouverture / fermeture.
 *
 * @param {{ rangeStartMs: number, rangeEndMs: number, count: number, dedicated: Array<{ kind: string, ms: number }> }} params
 * @returns {Array<{ requestDate: string, requestedTime: string }>}
 */
function generateCountSlotsHonoringDedicated(params) {
  const count = Math.min(MAX_HONORED_RANDOM_SLOTS, Math.max(1, Math.round(Number(params.count) || 0)));
  if (!Number.isFinite(count) || params.rangeEndMs < params.rangeStartMs) {
    return [];
  }
  const dedicated = dedicatedInRange(params.dedicated, params.rangeStartMs, params.rangeEndMs);
  const closingMs = firstClosingMs(dedicated);
  const openingMs = firstOpeningAfterCloseMs(dedicated, closingMs);
  const dedicatedMs = new Set(dedicated.map((d) => d.ms));
  const startMs = closingMs != null ? closingMs : params.rangeStartMs;
  const endMs = openingMs != null ? openingMs : params.rangeEndMs;
  const spanMin = Math.round((endMs - startMs) / 60000);
  const offsets = evenSpreadMinuteOffsets(spanMin, count, closingMs != null, openingMs != null);
  const out = [];
  for (const off of offsets) {
    const cursor = new Date(startMs);
    cursor.setMinutes(cursor.getMinutes() + off);
    const t = cursor.getTime();
    if (Number.isNaN(t) || t < params.rangeStartMs || t > params.rangeEndMs) continue;
    if (dedicatedMs.has(t)) continue;
    out.push(slotFromMs(t));
  }
  return out;
}

/**
 * Horaires d’une fenêtre RANDOM (ancre + HH:MM), hors jetons jour/nuit sans heure.
 *
 * @param {{
 *   anchorDateIso: string,
 *   windowStart: string,
 *   windowEnd: string,
 *   intervalMinutes: number|null,
 *   roundsCount: number|null,
 *   dedicated: Array<{ kind: string, ms: number }>
 * }} params
 * @returns {Array<{ requestDate: string, requestedTime: string, occurrenceDateIso: string, calendarDateIso: string }>}
 */
function generateRandomWindowSlots(params) {
  const ws = String(params.windowStart || "").trim();
  const we = String(params.windowEnd || "").trim();
  const anchorDateIso = String(params.anchorDateIso || "").trim();
  if (!TIME_RE.test(ws) || !TIME_RE.test(we) || !anchorDateIso) return [];

  const crosses = windowCrossesMidnight(ws, we);
  const startMs = parseDateTimeSafeMs(anchorDateIso, ws);
  const endIso = crosses ? addDaysIso(anchorDateIso, 1) : anchorDateIso;
  const endMs = parseDateTimeSafeMs(endIso, we);
  if (startMs == null || endMs == null || endMs < startMs) return [];

  const nightDedicated = dedicatedInRange(params.dedicated || [], startMs, endMs);
  const intervalMin =
    params.intervalMinutes != null && Number.isFinite(Number(params.intervalMinutes)) && Number(params.intervalMinutes) >= 1
      ? Math.min(100080, Math.round(Number(params.intervalMinutes)))
      : null;
  const rounds =
    params.roundsCount != null && Number.isFinite(Number(params.roundsCount)) && Number(params.roundsCount) >= 1
      ? Math.min(MAX_HONORED_RANDOM_SLOTS, Math.round(Number(params.roundsCount)))
      : null;

  const raw =
    intervalMin != null
      ? walkIntervalHonoringOpeningClosing({
          validityStartMs: startMs,
          validityEndMs: endMs,
          intervalMinutes: intervalMin,
          dedicated: nightDedicated
        })
      : generateCountSlotsHonoringDedicated({
          rangeStartMs: startMs,
          rangeEndMs: endMs,
          count: rounds != null ? rounds : 1,
          dedicated: nightDedicated
        });

  return raw.map((slot) => {
    const occurrenceDateIso = slot.requestDate;
    return {
      requestDate: occurrenceDateIso,
      requestedTime: slot.requestedTime,
      occurrenceDateIso,
      calendarDateIso: crosses ? anchorDateIso : occurrenceDateIso
    };
  });
}

/**
 * Libellé récap si une fermeture / ouverture a déformé la série aléatoire.
 *
 * @param {Array<{ kind: string, ms: number }>} dedicated
 * @param {boolean} seriesEnabled
 * @returns {string}
 */
function intervalHonorRecapNote(dedicated, seriesEnabled) {
  if (!seriesEnabled) return "";
  const list = Array.isArray(dedicated) ? dedicated : [];
  const hasClosing = list.some((d) => d.kind === "CLOSING");
  const hasOpening = list.some((d) => d.kind === "OPENING");
  if (!hasClosing && !hasOpening) return "";
  if (hasClosing && hasOpening) {
    return "Les rondes aléatoires commencent après la fermeture et s’arrêtent avant l’ouverture (un seul passage à ces horaires, pas de 08:30 si l’ouverture est à 08:00).";
  }
  if (hasClosing) {
    return "Les rondes aléatoires commencent après la fermeture (premier passage de fréquence = fermeture + intervalle, ou répartition après la fermeture).";
  }
  return "Les rondes aléatoires s’arrêtent avant l’ouverture : ce créneau est l’ouverture, pas une ronde de fréquence.";
}

module.exports = {
  TIME_RE,
  MAX_HONORED_RANDOM_SLOTS,
  addDaysIso,
  parseDateTimeSafeMs,
  walkIntervalHonoringOpeningClosing,
  generateCountSlotsHonoringDedicated,
  generateRandomWindowSlots,
  intervalHonorRecapNote
};
