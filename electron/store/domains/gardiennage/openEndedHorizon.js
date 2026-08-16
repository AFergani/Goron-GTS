/**
 * Extension PostgreSQL de l'horizon des gardiennages H24 ouverts.
 *
 * Les jours fériés proviennent exclusivement du cache du domaine `data/holidays`.
 *
 * @module electron/store/domains/gardiennage/openEndedHorizon
 */

const holidaysDomain = require("../data/holidays");
const { addDaysIso } = require("./helpers");
const { buildGardiennageSlotsFromSnapshot } = require("./plannerEngine");
const { requireGardiennagePersistence } = require("./persistence");

const GARDIENNAGE_OPEN_ENDED_HORIZON_ACTOR = "system:gardiennage-open-ended-horizon";
const GARDIENNAGE_OPEN_ENDED_HORIZON_DAYS = 90;
const GARDIENNAGE_OPEN_ENDED_EXTEND_WHEN_DAYS_LEFT = 14;
const MS_PER_DAY = 86400000;

/**
 * Calcule la fin cible de l'horizon glissant.
 *
 * @param {string} validFromDate
 * @param {string} [referenceDateIso]
 * @returns {string}
 */
function computeOpenEndedHorizonEndDate(validFromDate, referenceDateIso) {
  const reference = String(referenceDateIso || "").trim() || new Date().toISOString().slice(0, 10);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(validFromDate || ""))
    ? String(validFromDate)
    : reference;
  const fromHorizon = addDaysIso(from, GARDIENNAGE_OPEN_ENDED_HORIZON_DAYS);
  const referenceHorizon = addDaysIso(reference, GARDIENNAGE_OPEN_ENDED_HORIZON_DAYS);
  return fromHorizon > referenceHorizon ? fromHorizon : referenceHorizon;
}

/** @param {object} row @returns {object|null} */
function parsePlanningSnapshot(row) {
  const raw = row.planning_snapshot_json;
  try {
    const snapshot = raw && typeof raw === "object" ? raw : JSON.parse(String(raw || ""));
    return snapshot && Number(snapshot.version) === 1 ? snapshot : null;
  } catch {
    return null;
  }
}

/** @param {unknown} value @returns {number|null} */
function resolveSlotEndMs(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const timestamp = new Date(raw.length === 16 ? `${raw}:00` : raw).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

/**
 * Prolonge les lots continus ouverts proches de leur fin d'horizon.
 *
 * @param {import('../../../userStore')} store
 * @param {{requesterUsername?:string}} [options]
 * @returns {Promise<{extendedCount:number,extendedBatchIds:string[]}>}
 */
async function extendOpenEndedGardiennageHorizons(
  store,
  { requesterUsername = GARDIENNAGE_OPEN_ENDED_HORIZON_ACTOR } = {}
) {
  const db = requireGardiennagePersistence(store, "gardiennage:extendHorizon");
  const today = new Date().toISOString().slice(0, 10);
  const nowMs = Date.now();
  const nowIso = new Date().toISOString();
  const holidays = holidaysDomain.getHolidayDateIsosForPlanning(store);
  const result = await db.transaction(async (tx) => {
    const activeRows = await tx.all(
      `SELECT * FROM gardiennage_entries
       WHERE status IN ('PLANIFIE', 'ACTIF')
         AND planning_batch_id IS NOT NULL
         AND TRIM(COALESCE(planning_snapshot_json, '')) <> ''
       ORDER BY planning_batch_id, created_at
       FOR UPDATE`,
      []
    );
    const anchors = new Map();
    for (const row of activeRows) {
      const batchId = String(row.planning_batch_id || "").trim();
      if (batchId && !anchors.has(batchId)) anchors.set(batchId, row);
    }
    const batchIds = [];
    const samples = [];
    for (const [batchId, anchor] of anchors) {
      const snapshot = parsePlanningSnapshot(anchor);
      if (!snapshot?.isOpenEnded || !snapshot?.isContinuous) continue;
      const slotEndMs = resolveSlotEndMs(anchor.planning_slot_end);
      if (slotEndMs == null) continue;
      if (Math.ceil((slotEndMs - nowMs) / MS_PER_DAY) > GARDIENNAGE_OPEN_ENDED_EXTEND_WHEN_DAYS_LEFT) continue;
      const targetEndDate = computeOpenEndedHorizonEndDate(snapshot.validFromDate, today);
      const validToTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(snapshot.validToTime || ""))
        ? snapshot.validToTime
        : snapshot.validFromTime;
      const nextSnapshot = {
        ...snapshot,
        validToDate: targetEndDate,
        validToTime,
        isOpenEnded: true,
        isContinuous: true
      };
      const [slot] = buildGardiennageSlotsFromSnapshot(nextSnapshot, { holidayDateIsos: holidays });
      if (!slot || resolveSlotEndMs(slot.endIso) <= slotEndMs) continue;
      const json = JSON.stringify(nextSnapshot);
      await tx.run(
        `UPDATE gardiennage_entries
         SET planning_snapshot_json = ?, updated_at = ?
         WHERE planning_batch_id = ? AND status IN ('CLOTURE', 'ANNULE')`,
        [json, nowIso, batchId]
      );
      const updateResult = await tx.run(
        `UPDATE gardiennage_entries
         SET planning_snapshot_json = ?, planning_slot_start = ?, planning_slot_end = ?,
             start_time = ?, end_time = ?, crosses_midnight = ?, recurrence_end_date = '', updated_at = ?
         WHERE planning_batch_id = ? AND status NOT IN ('CLOTURE', 'ANNULE')`,
        [json, slot.startIso, slot.endIso, slot.startTime, slot.endTime, slot.crossesMidnight ? 1 : 0, nowIso, batchId]
      );
      if (!updateResult.changes) continue;
      batchIds.push(batchId);
      if (samples.length < 20) {
        samples.push({
          batchId,
          siteDisplay: anchor.site_display || "",
          previousSlotEnd: anchor.planning_slot_end || "",
          nextSlotEnd: slot.endIso,
          targetEndDate
        });
      }
    }
    return { batchIds, samples };
  });
  if (result.batchIds.length) {
    store.logAudit({
      actorUsername: requesterUsername,
      action: "GARDIENNAGE_OPEN_ENDED_HORIZON_BATCH",
      status: "SUCCESS",
      details: {
        total: result.batchIds.length,
        success: result.batchIds.length,
        failed: 0,
        horizonDays: GARDIENNAGE_OPEN_ENDED_HORIZON_DAYS,
        extendWhenDaysLeft: GARDIENNAGE_OPEN_ENDED_EXTEND_WHEN_DAYS_LEFT,
        samples: result.samples
      }
    });
  }
  return { extendedCount: result.batchIds.length, extendedBatchIds: result.batchIds };
}

module.exports = {
  GARDIENNAGE_OPEN_ENDED_HORIZON_DAYS,
  GARDIENNAGE_OPEN_ENDED_EXTEND_WHEN_DAYS_LEFT,
  computeOpenEndedHorizonEndDate,
  extendOpenEndedGardiennageHorizons
};
