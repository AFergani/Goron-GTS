/**
 * Horizon glissant des gardiennages H24 « jusqu'à nouvel ordre » (`isOpenEnded`).
 *
 * Prolonge automatiquement la fin du créneau continu tant que le lot est PLANIFIE ou ACTIF,
 * pour maintenir au moins {@link GARDIENNAGE_OPEN_ENDED_HORIZON_DAYS} jours de couverture à l'avance.
 * Déclenché avant la clôture automatique (liste + timer `main.js`).
 */

const { writeAudit } = require("../core/audit");
const { buildGardiennageSlotsFromSnapshot } = require("./gardiennagePlannerEngine");

const GARDIENNAGE_OPEN_ENDED_HORIZON_ACTOR = "system:gardiennage-open-ended-horizon";
const GARDIENNAGE_OPEN_ENDED_HORIZON_DAYS = 90;
/** Prolonger lorsque la fin planifiée est à cette distance (jours) ou moins. */
const GARDIENNAGE_OPEN_ENDED_EXTEND_WHEN_DAYS_LEFT = 14;
const MS_PER_DAY = 86400000;

function addDaysIso(isoDate, amount) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + amount);
  const pad2 = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Date de fin cible : max(début + 90 j, aujourd'hui + 90 j).
 *
 * @param {string} validFromDate
 * @param {string} [referenceDateIso]
 * @returns {string}
 */
function computeOpenEndedHorizonEndDate(validFromDate, referenceDateIso) {
  const ref = String(referenceDateIso || "").trim() || new Date().toISOString().slice(0, 10);
  const from = String(validFromDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return addDaysIso(ref, GARDIENNAGE_OPEN_ENDED_HORIZON_DAYS);
  const fromHorizon = addDaysIso(from, GARDIENNAGE_OPEN_ENDED_HORIZON_DAYS);
  const refHorizon = addDaysIso(ref, GARDIENNAGE_OPEN_ENDED_HORIZON_DAYS);
  return fromHorizon > refHorizon ? fromHorizon : refHorizon;
}

function parsePlanningSnapshot(row) {
  const raw = String(row.planning_snapshot_json || "").trim();
  if (!raw) return null;
  try {
    const snap = JSON.parse(raw);
    if (!snap || Number(snap.version) !== 1) return null;
    return snap;
  } catch {
    return null;
  }
}

function resolveSlotEndMs(row) {
  const slotEndRaw = String(row.planning_slot_end || "").trim();
  if (slotEndRaw) {
    const iso = slotEndRaw.length === 16 ? `${slotEndRaw}:00` : slotEndRaw;
    const ts = new Date(iso).getTime();
    return Number.isNaN(ts) ? null : ts;
  }
  return null;
}

function loadHolidayDateIsos(store) {
  return store.db
    .prepare("SELECT date_iso FROM data_holidays ORDER BY date_iso ASC")
    .all()
    .map((row) => String(row.date_iso || "").trim())
    .filter(Boolean);
}

function resolveH24ValidToTime(validFromTime, validToTime) {
  const to = String(validToTime || "").trim();
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(to)) return to;
  const from = String(validFromTime || "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(from) ? from : "";
}

/**
 * @param {import('../userStore')} store
 * @param {object} [options]
 * @param {string} [options.requesterUsername]
 * @returns {{ extendedCount: number, extendedBatchIds: string[] }}
 */
function extendOpenEndedGardiennageHorizons(
  store,
  { requesterUsername = GARDIENNAGE_OPEN_ENDED_HORIZON_ACTOR } = {}
) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const nowMs = Date.now();
  const nowIso = new Date().toISOString();

  const activeRows = store.db
    .prepare(
      `SELECT * FROM gardiennage_entries
       WHERE status IN ('PLANIFIE', 'ACTIF')
         AND planning_batch_id IS NOT NULL
         AND TRIM(planning_snapshot_json) <> ''`
    )
    .all();

  const batchAnchors = new Map();
  for (const row of activeRows) {
    const batchId = String(row.planning_batch_id || "").trim();
    if (!batchId || batchAnchors.has(batchId)) continue;
    batchAnchors.set(batchId, row);
  }

  const holidayDateIsos = loadHolidayDateIsos(store);
  const extendedBatchIds = [];
  const extendedSamples = [];

  for (const [batchId, anchorRow] of batchAnchors) {
    const snap = parsePlanningSnapshot(anchorRow);
    if (!snap?.isOpenEnded || !snap?.isContinuous) continue;

    const slotEndMs = resolveSlotEndMs(anchorRow);
    if (slotEndMs == null) continue;

    const daysLeft = Math.ceil((slotEndMs - nowMs) / MS_PER_DAY);
    if (daysLeft > GARDIENNAGE_OPEN_ENDED_EXTEND_WHEN_DAYS_LEFT) continue;

    const targetEndDate = computeOpenEndedHorizonEndDate(snap.validFromDate, todayIso);
    const validToTime = resolveH24ValidToTime(snap.validFromTime, snap.validToTime);
    if (!validToTime) continue;

    const targetEndIso = `${targetEndDate}T${validToTime}:00`;
    const targetEndMs = new Date(targetEndIso).getTime();
    if (Number.isNaN(targetEndMs) || targetEndMs <= slotEndMs) continue;

    const nextSnapshot = {
      ...snap,
      validToDate: targetEndDate,
      validToTime,
      isOpenEnded: true,
      isContinuous: true
    };
    const slots = buildGardiennageSlotsFromSnapshot(nextSnapshot, { holidayDateIsos });
    if (!slots.length) continue;
    const slot = slots[0];
    const nextSnapshotJson = JSON.stringify(nextSnapshot);

    const batchRows = store.db
      .prepare("SELECT * FROM gardiennage_entries WHERE planning_batch_id = ?")
      .all(batchId);

    const updateSnapshotOnly = store.db.prepare(
      `UPDATE gardiennage_entries
       SET planning_snapshot_json = ?, updated_at = ?
       WHERE id = ?`
    );
    const updateActiveSlot = store.db.prepare(
      `UPDATE gardiennage_entries
       SET planning_snapshot_json = ?,
           planning_slot_start = ?,
           planning_slot_end = ?,
           start_time = ?,
           end_time = ?,
           crosses_midnight = ?,
           recurrence_end_date = '',
           updated_at = ?
       WHERE id = ?`
    );

    for (const row of batchRows) {
      const status = String(row.status || "");
      if (status === "CLOTURE" || status === "ANNULE") {
        updateSnapshotOnly.run(nextSnapshotJson, nowIso, row.id);
        continue;
      }
      updateActiveSlot.run(
        nextSnapshotJson,
        slot.startIso,
        slot.endIso,
        slot.startTime,
        slot.endTime,
        slot.crossesMidnight ? 1 : 0,
        nowIso,
        row.id
      );
    }

    extendedBatchIds.push(batchId);
    if (extendedSamples.length < 20) {
      extendedSamples.push({
        batchId,
        siteDisplay: anchorRow.site_display || "",
        previousSlotEnd: anchorRow.planning_slot_end || "",
        nextSlotEnd: slot.endIso,
        targetEndDate
      });
    }
  }

  if (extendedBatchIds.length > 0) {
    writeAudit(store.db, {
      actorUsername: requesterUsername,
      action: "GARDIENNAGE_OPEN_ENDED_HORIZON_BATCH",
      status: "SUCCESS",
      details: {
        total: extendedBatchIds.length,
        success: extendedBatchIds.length,
        failed: 0,
        horizonDays: GARDIENNAGE_OPEN_ENDED_HORIZON_DAYS,
        extendWhenDaysLeft: GARDIENNAGE_OPEN_ENDED_EXTEND_WHEN_DAYS_LEFT,
        samples: extendedSamples
      }
    });
  }

  return { extendedCount: extendedBatchIds.length, extendedBatchIds };
}

module.exports = {
  GARDIENNAGE_OPEN_ENDED_HORIZON_DAYS,
  GARDIENNAGE_OPEN_ENDED_EXTEND_WHEN_DAYS_LEFT,
  computeOpenEndedHorizonEndDate,
  extendOpenEndedGardiennageHorizons
};
