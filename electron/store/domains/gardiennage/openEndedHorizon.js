/**
 * Extension PostgreSQL de l'horizon des gardiennages H24 ouverts.
 *
 * Prolonge le snapshot et le créneau des lots continus sans date de fin
 * lorsque la fin planifiée est à 14 jours ou moins.
 * Appelé par la liste, le badge, le timer `electron/main.js` et `UserStore`.
 * Audit agrégé `GARDIENNAGE_OPEN_ENDED_HORIZON_BATCH` (pas un log par lot).
 *
 * @module electron/store/domains/gardiennage/openEndedHorizon
 */

const holidaysDomain = require("../data/holidays");
const {
  computeOpenEndedHorizonEndDate,
  GARDIENNAGE_OPEN_ENDED_HORIZON_DAYS,
  isOpenEndedContinuousSnapshot,
  OPEN_STATUSES_SQL,
  parseIsoDateTimeMs,
  parsePlanningSnapshotJson,
  resolveSystemActor,
  toIsoTime
} = require("./helpers");
const { buildGardiennageSlotsFromSnapshot } = require("./plannerEngine");
const { requireGardiennagePersistence } = require("./persistence");

const GARDIENNAGE_OPEN_ENDED_HORIZON_ACTOR = "system:gardiennage-open-ended-horizon";
const GARDIENNAGE_OPEN_ENDED_EXTEND_WHEN_DAYS_LEFT = 14;
const MS_PER_DAY = 86400000;
const HORIZON_SELECT = `site_display, planning_batch_id, planning_snapshot_json,
     planning_slot_end, created_at`;

/**
 * Prolonge les lots continus ouverts proches de leur fin d'horizon.
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterUsername?: string }} [options]
 * @returns {Promise<{ extendedCount: number, extendedBatchIds: string[] }>}
 */
async function extendOpenEndedGardiennageHorizons(store, options = {}) {
  const db = requireGardiennagePersistence(store, "gardiennage:extendHorizon");
  const nowMs = Date.now();
  const nowIso = new Date().toISOString();
  const holidays = holidaysDomain.getHolidayDateIsosForPlanning(store);
  const result = await db.transaction(async (tx) => {
    const activeRows = await tx.all(
      `SELECT ${HORIZON_SELECT} FROM gardiennage_entries
       WHERE ${OPEN_STATUSES_SQL}
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
      const snapshot = parsePlanningSnapshotJson(anchor.planning_snapshot_json);
      if (!isOpenEndedContinuousSnapshot(snapshot)) continue;
      const slotEndMs = parseIsoDateTimeMs(anchor.planning_slot_end);
      if (slotEndMs == null) continue;
      if (Math.ceil((slotEndMs - nowMs) / MS_PER_DAY) > GARDIENNAGE_OPEN_ENDED_EXTEND_WHEN_DAYS_LEFT) continue;
      const targetEndDate = computeOpenEndedHorizonEndDate(snapshot.validFromDate);
      const validToTime = toIsoTime(snapshot.validToTime) || snapshot.validFromTime;
      const nextSnapshot = {
        ...snapshot,
        validToDate: targetEndDate,
        validToTime,
        isOpenEnded: true,
        isContinuous: true
      };
      const [slot] = buildGardiennageSlotsFromSnapshot(nextSnapshot, { holidayDateIsos: holidays });
      if (!slot || parseIsoDateTimeMs(slot.endIso) <= slotEndMs) continue;
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
      actorUsername: resolveSystemActor(options.requesterUsername, GARDIENNAGE_OPEN_ENDED_HORIZON_ACTOR),
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

module.exports = { extendOpenEndedGardiennageHorizons };
