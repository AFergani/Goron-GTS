/**
 * Clôture automatique des rondes exceptionnelles restées `EN_COURS` après la date de passage.
 *
 * Délai : 5 jours après `request_date` (hors rondes `PLANIFIE`). Appelé avant `listRondes`,
 * par timer `electron/main.js` et via `UserStore` / réexport `ronde.js`.
 * Compte rendu système aligné sur le gardiennage ; audit `RONDE_EXCEPTIONAL_AUTO_CLOSE_BATCH`.
 */

/** Libellé enregistré en compte rendu (homogène avec `gardiennageAutoClose.js`). */
const RONDE_AUTO_CLOSURE_REPORT = "Clôture automatique par système";
const RONDE_AUTO_CLOSE_ACTOR = "system:ronde-exceptional-auto-close";
/** Délai en jours après la date de passage avant clôture auto. */
const EXCEPTIONAL_AUTO_CLOSE_DELAY_DAYS = 5;

/**
 * @param {unknown} value
 * @returns {string}
 */
function toIsoDate(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return "";
}

/**
 * @param {string} isoDate
 * @param {number} amount
 * @returns {string}
 */
function shiftIsoDate(isoDate, amount) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + amount);
  return d.toISOString().slice(0, 10);
}

/**
 * @param {string} source - `PLANIFIE` exclu de l'auto-clôture.
 * @returns {boolean}
 */
function isExceptionalRondeSource(source) {
  return String(source || "").trim() !== "PLANIFIE";
}

/**
 * Passage dont la date est dépassée depuis au moins N jours (date de passage = `request_date`).
 *
 * @param {string} requestDateIso
 * @param {string} todayIso
 * @param {number} delayDays
 * @returns {boolean}
 */
function isPassagePastAutoCloseDelay(requestDateIso, todayIso, delayDays) {
  const passageDate = toIsoDate(requestDateIso);
  if (!passageDate || !toIsoDate(todayIso)) return false;
  const cutoffIso = shiftIsoDate(passageDate, delayDays);
  return todayIso >= cutoffIso;
}

/**
 * Clôture les rondes `URGENCE` / `LIEE_INTERVENTION` en `EN_COURS` dont le délai est dépassé.
 * Les rondes contractuelles (`PLANIFIE`) sont ignorées.
 *
 * @param {import('../userStore')} store
 * @param {object} [options]
 * @param {string} [options.requesterUsername="system:ronde-exceptional-auto-close"]
 * @returns {{ closedCount: number, closedIds: string[], delayDays: number }}
 */
function autoCloseExpiredExceptionalRondes(store, { requesterUsername = RONDE_AUTO_CLOSE_ACTOR } = {}) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  const rows = store.db
    .prepare("SELECT id, source, request_date, site_display, status FROM ronde_entries WHERE status = 'EN_COURS'")
    .all();

  const closedIds = [];
  const closedSamples = [];

  for (const row of rows) {
    if (!isExceptionalRondeSource(row.source)) continue;
    if (!isPassagePastAutoCloseDelay(row.request_date, todayIso, EXCEPTIONAL_AUTO_CLOSE_DELAY_DAYS)) continue;

    store.db
      .prepare(
        `UPDATE ronde_entries
         SET status = 'CLOTURE',
             report = ?,
             closed_at = ?,
             updated_at = ?
         WHERE id = ? AND status = 'EN_COURS'`
      )
      .run(RONDE_AUTO_CLOSURE_REPORT, nowIso, nowIso, row.id);

    closedIds.push(row.id);
    if (closedSamples.length < 20) {
      closedSamples.push({
        id: row.id,
        source: row.source,
        requestDate: row.request_date || "",
        siteDisplay: row.site_display || ""
      });
    }
  }

  if (closedIds.length > 0) {
    store.logAudit({
      actorUsername: requesterUsername,
      action: "RONDE_EXCEPTIONAL_AUTO_CLOSE_BATCH",
      details: {
        total: closedIds.length,
        success: closedIds.length,
        failed: 0,
        delayDays: EXCEPTIONAL_AUTO_CLOSE_DELAY_DAYS,
        closureReport: RONDE_AUTO_CLOSURE_REPORT,
        samples: closedSamples
      }
    });
  }

  return { closedCount: closedIds.length, closedIds, delayDays: EXCEPTIONAL_AUTO_CLOSE_DELAY_DAYS };
}

module.exports = {
  autoCloseExpiredExceptionalRondes
};
