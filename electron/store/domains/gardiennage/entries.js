/**
 * Liste, création et mise à jour des gardiennages dans PostgreSQL.
 *
 * Les liens vers Intervention et Ronde sont validés dans la même base.
 * Statuts, clôture, réouverture et suppression : `entriesLifecycle.js`.
 *
 * @module electron/store/domains/gardiennage/entries
 */

const { actorName } = require("../../core/actorName");
const { assertOptimisticLock } = require("../data/optimisticLock");
const { stringifyExportExtraJson } = require("../../core/exportExtraJson");
const { allocateNextDailyCode } = require("../../core/dailyEntryCode");
const { generateEntityId } = require("../../core/ids");
const { normalizeDateIso } = require("../../core/isoDate");
const holidaysDomain = require("../data/holidays");
const interventionDomain = require("../intervention");
const { autoCloseExpiredGardiennageEntries } = require("./autoClose");
const {
  filterSlotsPreservingClosed,
  isPonctuelPlanningSnapshot,
  normalizePlanningSnapshot,
  toIsoTime,
  validatePlanningLinesNoOverlap
} = require("./helpers");
const {
  GARDIENNAGE_ENTRY_SELECT,
  mapGardiennageRow,
  requireEntryId,
  toGardiennageAuditSnapshot
} = require("./mapping");
const { extendOpenEndedGardiennageHorizons } = require("./openEndedHorizon");
const { requireGardiennagePersistence } = require("./persistence");
const { buildGardiennageSlotsFromSnapshot } = require("./plannerEngine");

const INSERT_SQL = `INSERT INTO gardiennage_entries (
  id, site_id, site_display, start_time, end_time, crosses_midnight,
  recurrence_start_date, recurrence_end_date, recurrence_days, is_ponctuel,
  intervenant_id, intervenant_name, notes, status, intervention_id, linked_ronde_id,
  closure_report, actual_start_time, actual_end_time, work_order_number, cancellation_reason,
  planning_batch_id, planning_snapshot_json, planning_slot_start, planning_slot_end,
  created_at, updated_at, daily_code, export_extra_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/**
 * Vérifie les liens vers Intervention et Ronde PostgreSQL.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @param {string} source
 * @returns {Promise<void>}
 */
async function validateCrossEngineLinks(store, payload, source) {
  const interventionId = String(payload.linkedInterventionId || "").trim();
  if (interventionId && !await interventionDomain.hasInterventionEntry(store, interventionId)) {
    store.fail(source, "Intervention liée introuvable.", "GARDIENNAGE_INTERVENTION_NOT_FOUND");
  }
  const rondeId = String(payload.linkedRondeId || "").trim();
  if (!rondeId) return;
  const db = requireGardiennagePersistence(store, source);
  const exists = Boolean(await db.get("SELECT id FROM ronde_entries WHERE id = ? LIMIT 1", [rondeId]));
  if (!exists) store.fail(source, "Ronde liée introuvable.", "GARDIENNAGE_RONDE_NOT_FOUND");
}

/**
 * Insère une ligne via l'adaptateur PostgreSQL ou son handle de transaction.
 *
 * @param {import('../../persistence/persistenceContract').PersistenceTransaction} db
 * @param {object} row
 * @returns {Promise<number>}
 */
async function insertGardiennageRow(db, row) {
  const result = await db.run(INSERT_SQL, [
    row.id, row.siteId || null, row.siteDisplay, row.startTime, row.endTime,
    row.crossesMidnight ? 1 : 0, row.recurrenceStartDate, row.recurrenceEndDate,
    127, row.isPonctuel ? 1 : 0, row.intervenantId || null, row.intervenantName,
    row.notes, row.status || "PLANIFIE", row.linkedInterventionId || null,
    row.linkedRondeId || null, row.closureReport || "", row.actualStartTime || "",
    row.actualEndTime || "", row.workOrderNumber || "", row.cancellationReason || "",
    row.planningBatchId || null, row.planningSnapshotJson || null,
    row.planningSlotStart || "", row.planningSlotEnd || "", row.createdAt, row.updatedAt,
    row.dailyCode || null, row.exportExtraJson || "{}"
  ]);
  return result.changes;
}

/**
 * Réutilise le numéro d'un créneau régénéré, sinon alloue le suivant du jour.
 *
 * @param {import('../../persistence/persistenceContract').PersistenceTransaction} tx
 * @param {Array<{ dailyCode: string, startDate: string, slotStart: string }>} pool
 * @param {string} startDate
 * @param {string} slotStartIso
 * @returns {Promise<string>}
 */
async function takeReusableGardiennageDailyCode(tx, pool, startDate, slotStartIso) {
  const slotKey = String(slotStartIso || "").trim();
  const dayKey = String(startDate || "").trim();
  let index = slotKey ? pool.findIndex((row) => row.slotStart === slotKey) : -1;
  if (index < 0 && dayKey) {
    index = pool.findIndex((row) => row.startDate === dayKey);
  }
  if (index >= 0) {
    const reused = pool[index].dailyCode;
    pool.splice(index, 1);
    if (reused) return reused;
  }
  return allocateNextDailyCode(tx, "gardiennage", startDate);
}

/**
 * @param {object} payload
 * @param {object} normalized
 * @param {string} id
 * @param {string} now
 * @returns {object}
 */
function makeBaseRow(payload, normalized, id, now) {
  return {
    id,
    siteId: String(payload.siteId || "").trim() || null,
    siteDisplay: String(payload.siteDisplay || "").trim(),
    startTime: normalized.startTime,
    endTime: normalized.endTime,
    crossesMidnight: normalized.endTime < normalized.startTime,
    recurrenceStartDate: normalized.recurrenceStartDate,
    recurrenceEndDate: normalized.recurrenceEndDate,
    isPonctuel: normalized.isPonctuel,
    intervenantId: String(payload.intervenantId || "").trim() || null,
    intervenantName: String(payload.intervenantName || "").trim(),
    notes: String(payload.notes || "").trim(),
    linkedInterventionId: String(payload.linkedInterventionId || "").trim() || null,
    linkedRondeId: String(payload.linkedRondeId || "").trim() || null,
    exportExtraJson: stringifyExportExtraJson(payload.exportExtraValues),
    createdAt: now,
    updatedAt: now
  };
}

/**
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @param {string} source
 * @returns {{ startTime: string, endTime: string, recurrenceStartDate: string, recurrenceEndDate: string, isPonctuel: boolean }}
 */
function normalizeRequest(store, payload, source) {
  const startTime = toIsoTime(payload.startTime);
  const endTime = toIsoTime(payload.endTime);
  if (!startTime || !endTime) {
    store.fail(source, "Les horaires de début et de fin sont obligatoires.", "GARDIENNAGE_TIME_REQUIRED");
  }
  const recurrenceStartDate = normalizeDateIso(payload.recurrenceStartDate);
  if (!recurrenceStartDate) {
    store.fail(source, "La date de début est obligatoire.", "GARDIENNAGE_DATE_REQUIRED");
  }
  const isPonctuel = Boolean(payload.isPonctuel);
  return {
    startTime,
    endTime,
    recurrenceStartDate,
    recurrenceEndDate: isPonctuel
      ? recurrenceStartDate
      : (normalizeDateIso(payload.recurrenceEndDate) || ""),
    isPonctuel
  };
}

/**
 * Liste les gardiennages après extension d'horizon et clôture automatique.
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string }} payload
 * @returns {Promise<object[]>}
 */
async function listGardiennages(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireGardiennagePersistence(store, "gardiennage:list");
  await extendOpenEndedGardiennageHorizons(store);
  await autoCloseExpiredGardiennageEntries(store);
  const rows = await db.all(
    `SELECT ${GARDIENNAGE_ENTRY_SELECT} FROM gardiennage_entries
     ORDER BY recurrence_start_date DESC, start_time ASC, id ASC`,
    []
  );
  return rows.map(mapGardiennageRow);
}

/**
 * Compte les gardiennages en cours couvrant la journée (badge sidebar).
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string, todayIso: string }} payload
 * @returns {Promise<{ count: number }>}
 */
async function getGardiennageTodayInProgressCount(store, { requesterRole, todayIso }) {
  store.ensureDataReaderRole(requesterRole);
  const day = normalizeDateIso(todayIso);
  if (!day) {
    store.fail("gardiennage:todayInProgressCount", "Date du jour invalide.", "GARDIENNAGE_BADGE_DATE_INVALID");
  }
  const db = requireGardiennagePersistence(store, "gardiennage:todayInProgressCount");
  await extendOpenEndedGardiennageHorizons(store);
  await autoCloseExpiredGardiennageEntries(store);
  const row = await db.get(
    `SELECT COUNT(*) AS count FROM gardiennage_entries
     WHERE status IN ('PLANIFIE', 'ACTIF')
       AND recurrence_start_date <= ?
       AND (NULLIF(BTRIM(recurrence_end_date), '') IS NULL OR recurrence_end_date >= ?)`,
    [day, day]
  );
  return { count: Number(row?.count || 0) };
}

/**
 * Crée une entrée simple ou un lot planifié.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function createGardiennage(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const actor = actorName(payload.requesterUsername);
  const entryId = requireEntryId(store, payload, "gardiennage:create");
  const db = requireGardiennagePersistence(store, "gardiennage:create");
  await validateCrossEngineLinks(store, payload, "gardiennage:create");
  const normalized = normalizeRequest(store, payload, "gardiennage:create");
  const snapshot = normalizePlanningSnapshot(payload);
  const holidays = holidaysDomain.getHolidayDateIsosForPlanning(store);
  try {
    validatePlanningLinesNoOverlap(snapshot, holidays);
  } catch (error) {
    store.fail("gardiennage:create", error.message, error.code || "GARDIENNAGE_PLANNER_OVERLAP");
  }
  const slots = snapshot ? buildGardiennageSlotsFromSnapshot(snapshot, { holidayDateIsos: holidays }) : [];
  if (snapshot && !slots.length) {
    store.fail("gardiennage:create", "Aucun créneau généré avec cette validité/lignes.", "GARDIENNAGE_PLANNER_EMPTY");
  }
  const now = new Date().toISOString();
  const batchId = snapshot ? entryId : null;
  const snapshotJson = snapshot ? JSON.stringify(snapshot) : null;
  await db.transaction(async (tx) => {
    if (await tx.get("SELECT id FROM gardiennage_entries WHERE id = ?", [entryId])) {
      store.fail("gardiennage:create", "Ce gardiennage existe déjà.", "GARDIENNAGE_ALREADY_EXISTS");
    }
    if (!snapshot) {
      const dailyCode = await allocateNextDailyCode(tx, "gardiennage", normalized.recurrenceStartDate);
      await insertGardiennageRow(tx, { ...makeBaseRow(payload, normalized, entryId, now), dailyCode });
      return;
    }
    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index];
      const dailyCode = await allocateNextDailyCode(tx, "gardiennage", slot.startDate);
      await insertGardiennageRow(tx, {
        ...makeBaseRow(payload, normalized, index === 0 ? entryId : generateEntityId(), now),
        startTime: slot.startTime,
        endTime: slot.endTime,
        crossesMidnight: slot.crossesMidnight,
        recurrenceStartDate: slot.startDate,
        recurrenceEndDate: snapshot.isOpenEnded ? "" : slot.endDate,
        isPonctuel: isPonctuelPlanningSnapshot(snapshot),
        planningBatchId: batchId,
        planningSnapshotJson: snapshotJson,
        planningSlotStart: slot.startIso,
        planningSlotEnd: slot.endIso,
        dailyCode
      });
    }
  });
  const created = await db.get(
    `SELECT ${GARDIENNAGE_ENTRY_SELECT} FROM gardiennage_entries WHERE id = ?`,
    [entryId]
  );
  if (snapshot) {
    store.logAudit({
      actorUsername: actor,
      action: "GARDIENNAGE_BATCH_CREATE",
      status: "SUCCESS",
      details: {
        batchId,
        total: slots.length,
        success: slots.length,
        failed: 0,
        siteDisplay: String(payload.siteDisplay || "").trim(),
        validFrom: snapshot.validFromDate,
        validTo: snapshot.validToDate,
        isContinuous: snapshot.isContinuous,
        linesCount: snapshot.lines.length,
        linkedInterventionId: String(payload.linkedInterventionId || "").trim() || null,
        linkedRondeId: String(payload.linkedRondeId || "").trim() || null
      }
    });
  } else {
    const mapped = mapGardiennageRow(created);
    await store.recordEntityChange({
      entityType: "gardiennage_entries",
      entityId: entryId,
      changedBy: actor,
      snapshot: toGardiennageAuditSnapshot(mapped)
    });
    store.logAudit({
      actorUsername: actor,
      action: "GARDIENNAGE_CREATE",
      status: "SUCCESS",
      details: { id: entryId, created: toGardiennageAuditSnapshot(mapped) }
    });
  }
  return mapGardiennageRow(created);
}

/**
 * Met à jour une entrée ou régénère son lot, avec contrôle optimiste.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function updateGardiennage(store, payload) {
  store.ensureDataManagerRole(payload.requesterRole);
  const actor = actorName(payload.requesterUsername);
  const entryId = requireEntryId(store, payload, "gardiennage:update");
  const db = requireGardiennagePersistence(store, "gardiennage:update");
  await validateCrossEngineLinks(store, payload, "gardiennage:update");
  const normalized = normalizeRequest(store, payload, "gardiennage:update");
  const snapshot = normalizePlanningSnapshot(payload);
  const holidays = holidaysDomain.getHolidayDateIsosForPlanning(store);
  try {
    validatePlanningLinesNoOverlap(snapshot, holidays);
  } catch (error) {
    store.fail("gardiennage:update", error.message, error.code || "GARDIENNAGE_PLANNER_OVERLAP");
  }
  const now = new Date().toISOString();
  const outcome = await db.transaction(async (tx) => {
    const existing = await tx.get(
      `SELECT ${GARDIENNAGE_ENTRY_SELECT} FROM gardiennage_entries WHERE id = ? FOR UPDATE`,
      [entryId]
    );
    if (!existing) store.fail("gardiennage:update", "Gardiennage introuvable.", "GARDIENNAGE_NOT_FOUND");
    assertOptimisticLock(
      store,
      "gardiennage:update",
      existing,
      payload.expectedUpdatedAt,
      "GARDIENNAGE_CONFLICT",
      "Ce gardiennage a été modifié par un autre utilisateur."
    );
    const batchId = String(existing.planning_batch_id || existing.id);
    if (!snapshot) {
      const result = await tx.run(
        `UPDATE gardiennage_entries SET
          site_id = ?, site_display = ?, start_time = ?, end_time = ?, crosses_midnight = ?,
          recurrence_start_date = ?, recurrence_end_date = ?, is_ponctuel = ?,
          intervenant_id = ?, intervenant_name = ?, notes = ?, intervention_id = ?, linked_ronde_id = ?,
          export_extra_json = ?,
          planning_batch_id = NULL, planning_snapshot_json = NULL,
          planning_slot_start = '', planning_slot_end = '', updated_at = ?
         WHERE id = ? AND updated_at = ?`,
        [
          String(payload.siteId || "").trim() || null, String(payload.siteDisplay || "").trim(),
          normalized.startTime, normalized.endTime, normalized.endTime < normalized.startTime ? 1 : 0,
          normalized.recurrenceStartDate, normalized.recurrenceEndDate, normalized.isPonctuel ? 1 : 0,
          String(payload.intervenantId || "").trim() || null, String(payload.intervenantName || "").trim(),
          String(payload.notes || "").trim(), String(payload.linkedInterventionId || "").trim() || null,
          String(payload.linkedRondeId || "").trim() || null,
          stringifyExportExtraJson(payload.exportExtraValues),
          now, entryId, payload.expectedUpdatedAt
        ]
      );
      if (!result.changes) store.fail("gardiennage:update", "Gardiennage modifié ailleurs.", "GARDIENNAGE_CONFLICT");
      return { existing, returnId: entryId, inserted: 0, preserved: 0 };
    }
    const generated = buildGardiennageSlotsFromSnapshot(snapshot, { holidayDateIsos: holidays });
    if (!generated.length) {
      store.fail("gardiennage:update", "Aucun créneau généré avec cette validité/lignes.", "GARDIENNAGE_PLANNER_EMPTY");
    }
    const closedRows = await tx.all(
      `SELECT ${GARDIENNAGE_ENTRY_SELECT} FROM gardiennage_entries
       WHERE (planning_batch_id = ? OR id = ?) AND status = 'CLOTURE' FOR UPDATE`,
      [batchId, entryId]
    );
    const slots = filterSlotsPreservingClosed(generated, closedRows);
    if (!slots.length && !closedRows.length) {
      store.fail("gardiennage:update", "Aucun créneau généré avec cette validité/lignes.", "GARDIENNAGE_PLANNER_EMPTY");
    }
    const previousOpen = await tx.all(
      `SELECT daily_code, recurrence_start_date, planning_slot_start
       FROM gardiennage_entries
       WHERE (planning_batch_id = ? OR id = ?) AND status <> 'CLOTURE'`,
      [batchId, entryId]
    );
    await tx.run(
      `DELETE FROM gardiennage_entries
       WHERE (planning_batch_id = ? OR id = ?) AND status <> 'CLOTURE'`,
      [batchId, entryId]
    );
    const closedIds = new Set(closedRows.map((row) => row.id));
    let returnId = closedIds.has(entryId) ? closedRows[0]?.id : entryId;
    const snapshotJson = JSON.stringify(snapshot);
    const createdAt = existing.created_at || now;
    const reusableCodes = previousOpen.map((row) => ({
      dailyCode: String(row.daily_code || "").trim(),
      startDate: String(row.recurrence_start_date || "").trim(),
      slotStart: String(row.planning_slot_start || "").trim()
    }));
    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index];
      const id = index === 0 && !closedIds.has(entryId) ? entryId : generateEntityId();
      if (index === 0) returnId = id;
      await insertGardiennageRow(tx, {
        ...makeBaseRow(payload, normalized, id, now),
        createdAt,
        startTime: slot.startTime,
        endTime: slot.endTime,
        crossesMidnight: slot.crossesMidnight,
        recurrenceStartDate: slot.startDate,
        recurrenceEndDate: snapshot.isOpenEnded ? "" : slot.endDate,
        isPonctuel: isPonctuelPlanningSnapshot(snapshot),
        planningBatchId: batchId,
        planningSnapshotJson: snapshotJson,
        planningSlotStart: slot.startIso,
        planningSlotEnd: slot.endIso,
        dailyCode: await takeReusableGardiennageDailyCode(tx, reusableCodes, slot.startDate, slot.startIso)
      });
    }
    await tx.run(
      `UPDATE gardiennage_entries
       SET site_id = ?, site_display = ?, intervenant_id = ?, intervenant_name = ?, notes = ?,
           intervention_id = ?, linked_ronde_id = ?, planning_snapshot_json = ?,
           export_extra_json = ?, updated_at = ?
       WHERE (planning_batch_id = ? OR id = ?) AND status = 'CLOTURE'`,
      [
        String(payload.siteId || "").trim() || null, String(payload.siteDisplay || "").trim(),
        String(payload.intervenantId || "").trim() || null, String(payload.intervenantName || "").trim(),
        String(payload.notes || "").trim(), String(payload.linkedInterventionId || "").trim() || null,
        String(payload.linkedRondeId || "").trim() || null, snapshotJson,
        stringifyExportExtraJson(payload.exportExtraValues), now, batchId, entryId
      ]
    );
    return { existing, returnId, inserted: slots.length, preserved: closedRows.length };
  });
  const updated = await db.get(
    `SELECT ${GARDIENNAGE_ENTRY_SELECT} FROM gardiennage_entries WHERE id = ?`,
    [outcome.returnId]
  );
  const mapped = mapGardiennageRow(updated);
  const historyBefore = await store.getEntityChangeHistory("gardiennage_entries", String(outcome.existing.id), 3);
  await store.recordEntityChange({
    entityType: "gardiennage_entries",
    entityId: String(outcome.returnId),
    changedBy: actor,
    snapshot: toGardiennageAuditSnapshot(mapped)
  });
  store.logAudit({
    actorUsername: actor,
    action: "GARDIENNAGE_UPDATE",
    status: "SUCCESS",
    details: {
      id: outcome.returnId,
      before: toGardiennageAuditSnapshot(mapGardiennageRow(outcome.existing)),
      after: {
        ...toGardiennageAuditSnapshot(mapped),
        planner: snapshot
          ? { generated: true, inserted: outcome.inserted, preservedClosed: outcome.preserved }
          : { generated: false }
      },
      historyBefore
    }
  });
  return mapped;
}

module.exports = {
  createGardiennage,
  getGardiennageTodayInProgressCount,
  listGardiennages,
  updateGardiennage
};
