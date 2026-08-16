/**
 * Clôture automatique PostgreSQL des gardiennages expirés.
 *
 * Appelé par la liste et le planificateur de fond ; produit un audit batch agrégé.
 *
 * @module electron/store/domains/gardiennage/autoClose
 */

const { addDaysIso, toIsoDate, toIsoTime } = require("./helpers");
const { requireGardiennagePersistence } = require("./persistence");

const GARDIENNAGE_AUTO_CLOSURE_REPORT = "Clôture automatique par système";
const GARDIENNAGE_AUTO_CLOSE_ACTOR = "system:gardiennage-auto-close";

/** @param {object} row @returns {boolean} */
function isOpenEndedContinuousRow(row) {
  const raw = row.planning_snapshot_json;
  try {
    const snapshot = raw && typeof raw === "object" ? raw : JSON.parse(String(raw || ""));
    return Boolean(snapshot?.isOpenEnded && snapshot?.isContinuous);
  } catch {
    return false;
  }
}

/** @param {object} row @returns {number|null} */
function resolveSlotEndMs(row) {
  const slotEnd = String(row.planning_slot_end || "").trim();
  if (slotEnd) {
    const timestamp = new Date(slotEnd.length === 16 ? `${slotEnd}:00` : slotEnd).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
  }
  const activeDate = toIsoDate(row.recurrence_start_date);
  const endTime = toIsoTime(row.end_time);
  if (!activeDate || !endTime) return null;
  const endDate = row.crosses_midnight ? addDaysIso(activeDate, 1) : activeDate;
  const timestamp = new Date(`${endDate}T${endTime}:00`).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

/**
 * Applique la clôture à une ligne au sein de la transaction PostgreSQL.
 *
 * @param {import('../../persistence/persistenceContract').PersistenceTransaction} tx
 * @param {object} row
 * @param {string} nowIso
 * @returns {Promise<boolean>}
 */
async function applyAutoCloseRow(tx, row, nowIso) {
  const targetDate = toIsoDate(row.recurrence_start_date);
  if (!targetDate) return false;
  const currentStart = String(row.recurrence_start_date || "");
  const currentEnd = String(row.recurrence_end_date || "");
  const inRange = targetDate >= currentStart && (!currentEnd || targetDate <= currentEnd);
  if (!row.is_ponctuel && inRange) {
    const closesSeries = Boolean(currentEnd && targetDate >= currentEnd);
    const nextStart = closesSeries ? currentStart : addDaysIso(targetDate, 1);
    const result = await tx.run(
      `UPDATE gardiennage_entries
       SET status = ?, recurrence_start_date = ?, closure_report = ?,
           actual_start_time = '', actual_end_time = '', work_order_number = '', updated_at = ?
       WHERE id = ?`,
      [closesSeries ? "CLOTURE" : "PLANIFIE", nextStart, GARDIENNAGE_AUTO_CLOSURE_REPORT, nowIso, row.id]
    );
    return result.changes > 0;
  }
  const nextEnd = row.is_ponctuel
    ? String(row.recurrence_end_date || "")
    : (!row.recurrence_end_date || row.recurrence_end_date > targetDate ? targetDate : row.recurrence_end_date);
  const result = await tx.run(
    `UPDATE gardiennage_entries
     SET status = 'CLOTURE', recurrence_end_date = ?, closure_report = ?,
         actual_start_time = '', actual_end_time = '', work_order_number = '', updated_at = ?
     WHERE id = ?`,
    [nextEnd, GARDIENNAGE_AUTO_CLOSURE_REPORT, nowIso, row.id]
  );
  return result.changes > 0;
}

/**
 * Clôture les fiches planifiées ou actives dont la fin est dépassée.
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
  const closed = await db.transaction(async (tx) => {
    const rows = await tx.all(
      "SELECT * FROM gardiennage_entries WHERE status IN ('PLANIFIE', 'ACTIF') FOR UPDATE",
      []
    );
    const ids = [];
    const samples = [];
    for (const row of rows) {
      if (isOpenEndedContinuousRow(row)) continue;
      const endMs = resolveSlotEndMs(row);
      if (endMs == null || now.getTime() < endMs) continue;
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
