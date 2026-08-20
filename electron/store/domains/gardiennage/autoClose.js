/**
 * Clôture automatique PostgreSQL des gardiennages échus (fin prévue + 3 jours).
 *
 * H24 jusqu'à nouvel ordre : ignoré. Pas de glissement de dates : la fiche passe en CLOTURE.
 * Appelé par la liste, le timer `electron/main.js` et `UserStore`.
 * Audit agrégé `GARDIENNAGE_AUTO_CLOSE_BATCH` (pas un log par ligne).
 *
 * @module electron/store/domains/gardiennage/autoClose
 */

const {
  GARDIENNAGE_AUTO_CLOSE_GRACE_DAYS,
  isAutoCloseDue,
  OPEN_STATUSES_SQL,
  resolveSystemActor
} = require("./helpers");
const { requireGardiennagePersistence } = require("./persistence");

const GARDIENNAGE_AUTO_CLOSURE_REPORT = "Clôture automatique par système";
const GARDIENNAGE_AUTO_CLOSE_ACTOR = "system:gardiennage-auto-close";

const AUTO_CLOSE_SELECT = `id, status, site_display, end_time, crosses_midnight,
     recurrence_start_date, recurrence_end_date, planning_snapshot_json, planning_slot_end`;

/**
 * Applique la clôture automatique à une ligne (prestation ou nuit entière).
 *
 * @param {{ run: Function }} tx - Transaction PostgreSQL.
 * @param {{ id: string }} row
 * @param {string} nowIso
 * @returns {Promise<boolean>}
 */
async function applyAutoCloseRow(tx, row, nowIso) {
  const result = await tx.run(
    `UPDATE gardiennage_entries
     SET status = 'CLOTURE', closure_report = ?,
         actual_start_time = '', actual_end_time = '', work_order_number = '', updated_at = ?
     WHERE id = ? AND ${OPEN_STATUSES_SQL}`,
    [GARDIENNAGE_AUTO_CLOSURE_REPORT, nowIso, row.id]
  );
  return Number(result.changes || 0) > 0;
}

/**
 * Clôture les fiches planifiées ou actives dont la fin + 3 jours est dépassée.
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterUsername?: string }} [options]
 * @returns {Promise<{ closedCount: number, closedIds: string[] }>}
 */
async function autoCloseExpiredGardiennageEntries(store, options = {}) {
  const db = requireGardiennagePersistence(store, "gardiennage:autoClose");
  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const closed = await db.transaction(async (tx) => {
    const rows = await tx.all(
      `SELECT ${AUTO_CLOSE_SELECT} FROM gardiennage_entries WHERE ${OPEN_STATUSES_SQL} FOR UPDATE`,
      []
    );
    const ids = [];
    const samples = [];
    for (const row of rows) {
      if (!isAutoCloseDue(row, nowMs)) continue;
      if (!(await applyAutoCloseRow(tx, row, nowIso))) continue;
      ids.push(row.id);
      if (samples.length < 20) {
        samples.push({
          siteDisplay: row.site_display || "",
          recurrenceStartDate: row.recurrence_start_date || "",
          endTime: row.end_time || ""
        });
      }
    }
    return { ids, samples };
  });
  if (closed.ids.length) {
    store.logAudit({
      actorUsername: resolveSystemActor(options.requesterUsername, GARDIENNAGE_AUTO_CLOSE_ACTOR),
      action: "GARDIENNAGE_AUTO_CLOSE_BATCH",
      status: "SUCCESS",
      details: {
        total: closed.ids.length,
        success: closed.ids.length,
        failed: 0,
        graceDays: GARDIENNAGE_AUTO_CLOSE_GRACE_DAYS,
        closureReport: GARDIENNAGE_AUTO_CLOSURE_REPORT,
        samples: closed.samples
      }
    });
  }
  return { closedCount: closed.ids.length, closedIds: closed.ids };
}

module.exports = { autoCloseExpiredGardiennageEntries };
