/**
 * Clôture automatique PostgreSQL des gardiennages échus (fin prévue + 3 jours).
 *
 * H24 jusqu'à nouvel ordre : ignoré. Pas de glissement de dates : la fiche passe en CLOTURE.
 * Appelé par la liste et le planificateur de fond ; produit un audit batch agrégé.
 *
 * @module electron/store/domains/gardiennage/autoClose
 */

const {
  isAutoCloseDue
} = require("./helpers");
const { requireGardiennagePersistence } = require("./persistence");

const GARDIENNAGE_AUTO_CLOSURE_REPORT = "Clôture automatique par système";
const GARDIENNAGE_AUTO_CLOSE_ACTOR = "system:gardiennage-auto-close";

/**
 * Applique la clôture automatique à une ligne (prestation ou nuit entière).
 *
 * @param {import('../../persistence/persistenceContract').PersistenceTransaction} tx
 * @param {object} row
 * @param {string} nowIso
 * @returns {Promise<boolean>}
 */
async function applyAutoCloseRow(tx, row, nowIso) {
  const result = await tx.run(
    `UPDATE gardiennage_entries
     SET status = 'CLOTURE', closure_report = ?,
         actual_start_time = '', actual_end_time = '', work_order_number = '', updated_at = ?
     WHERE id = ?`,
    [GARDIENNAGE_AUTO_CLOSURE_REPORT, nowIso, row.id]
  );
  return result.changes > 0;
}

/**
 * Clôture les fiches planifiées ou actives dont la fin + 3 jours est dépassée.
 *
 * @param {import('../../../userStore')} store
 * @param {{requesterUsername?:string}} [options]
 * @returns {Promise<{closedCount:number,closedIds:string[]}>}
 */
async function autoCloseExpiredGardiennageEntries(
  store,
  { requesterUsername = GARDIENNAGE_AUTO_CLOSE_ACTOR } = {}
) {
  const db = requireGardiennagePersistence(store, "gardiennage:autoClose");
  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const closed = await db.transaction(async (tx) => {
    const rows = await tx.all(
      "SELECT * FROM gardiennage_entries WHERE status IN ('PLANIFIE', 'ACTIF') FOR UPDATE",
      []
    );
    const ids = [];
    const samples = [];
    for (const row of rows) {
      if (!isAutoCloseDue(row, nowMs)) continue;
      if (!await applyAutoCloseRow(tx, row, nowIso)) continue;
      ids.push(row.id);
      if (samples.length < 20) {
        samples.push({
          id: row.id,
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
      actorUsername: requesterUsername,
      action: "GARDIENNAGE_AUTO_CLOSE_BATCH",
      status: "SUCCESS",
      details: {
        total: closed.ids.length,
        success: closed.ids.length,
        failed: 0,
        closureReport: GARDIENNAGE_AUTO_CLOSURE_REPORT,
        samples: closed.samples
      }
    });
  }
  return { closedCount: closed.ids.length, closedIds: closed.ids };
}

module.exports = { autoCloseExpiredGardiennageEntries };
