/**
 * Clôture automatique PostgreSQL des rondes exceptionnelles expirées.
 *
 * Délai : 3 jours après `request_date` pour les sources hors `PLANIFIE`
 * (même grâce que le gardiennage).
 * Branché via `electron/main.js` et la façade `ronde/index.js`.
 *
 * @module electron/store/domains/ronde/autoClose
 */

const { addDaysIso, normalizeDateIso, todayDateIso } = require("../../core/isoDate");
const { requireRondePersistence } = require("./persistence");
const { RONDE_ENTRY_SELECT } = require("./mapping");
const { GARDIENNAGE_AUTO_CLOSE_GRACE_DAYS } = require("../gardiennage/helpers");

/** Libellé enregistré en compte rendu (homogène avec gardiennage). */
const RONDE_AUTO_CLOSURE_REPORT = "Clôture automatique par système";
const RONDE_AUTO_CLOSE_ACTOR = "system:ronde-exceptional-auto-close";
/** Délai en jours après la date de passage avant clôture auto (aligné gardiennage). */
const EXCEPTIONAL_AUTO_CLOSE_DELAY_DAYS = GARDIENNAGE_AUTO_CLOSE_GRACE_DAYS;

/**
 * @param {string} source - `PLANIFIE` exclu de l'auto-clôture.
 * @returns {boolean}
 */
function isExceptionalRondeSource(source) {
  return String(source || "").trim() !== "PLANIFIE";
}

/**
 * Passage dont la date est dépassée depuis au moins N jours.
 *
 * @param {string} requestDateIso
 * @param {string} todayIso
 * @param {number} delayDays
 * @returns {boolean}
 */
function isPassagePastAutoCloseDelay(requestDateIso, todayIso, delayDays) {
  const passageDate = normalizeDateIso(requestDateIso);
  if (!passageDate || !normalizeDateIso(todayIso)) return false;
  const cutoffIso = addDaysIso(passageDate, delayDays);
  return todayIso >= cutoffIso;
}

/**
 * Clôture les rondes `URGENCE` / `LIEE_INTERVENTION` en `EN_COURS` dont le délai est dépassé.
 *
 * @param {import('../../../userStore')} store
 * @param {object} [options]
 * @param {string} [options.requesterUsername="system:ronde-exceptional-auto-close"]
 * @returns {Promise<{ closedCount: number, closedIds: string[], delayDays: number }>}
 */
async function autoCloseExpiredExceptionalRondes(store, { requesterUsername = RONDE_AUTO_CLOSE_ACTOR } = {}) {
  const db = requireRondePersistence(store, "ronde:autoClose");
  const todayIso = todayDateIso();
  const nowIso = new Date().toISOString();

  const candidates = await db.all(
    `SELECT id, source, request_date, site_display, status
     FROM ronde_entries WHERE status = 'EN_COURS'`,
    []
  );

  const toClose = candidates.filter(
    (row) => isExceptionalRondeSource(row.source)
      && isPassagePastAutoCloseDelay(row.request_date, todayIso, EXCEPTIONAL_AUTO_CLOSE_DELAY_DAYS)
  );

  const closedIds = [];
  const closedSamples = [];

  if (toClose.length) {
    await db.transaction(async (tx) => {
      for (const candidate of toClose) {
        const row = await tx.get(
          `SELECT ${RONDE_ENTRY_SELECT} FROM ronde_entries WHERE id = ? FOR UPDATE`,
          [candidate.id]
        );
        if (!row || row.status !== "EN_COURS") continue;
        if (!isExceptionalRondeSource(row.source)) continue;
        if (!isPassagePastAutoCloseDelay(row.request_date, todayIso, EXCEPTIONAL_AUTO_CLOSE_DELAY_DAYS)) continue;

        const result = await tx.run(
          `UPDATE ronde_entries
           SET status = 'CLOTURE', report = ?, closed_at = ?, updated_at = ?
           WHERE id = ? AND status = 'EN_COURS'`,
          [RONDE_AUTO_CLOSURE_REPORT, nowIso, nowIso, row.id]
        );
        if (!result.changes) continue;

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
    });
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
