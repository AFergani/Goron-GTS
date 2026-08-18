/**
 * CRUD, statuts et clôture des gardiennages dans PostgreSQL.
 *
 * Les liens vers Intervention et Ronde sont validés dans la même base PostgreSQL.
 *
 * @module electron/store/domains/gardiennage/entries
 */

const { generateEntityId } = require("../../core/ids");
const holidaysDomain = require("../data/holidays");
const interventionDomain = require("../intervention");
const { autoCloseExpiredGardiennageEntries } = require("./autoClose");
const {
  filterSlotsPreservingClosed,
  isManualCloseAllowed,
  isOpenEndedContinuousRow,
  isPonctuelPlanningSnapshot,
  normalizePlanningSnapshot,
  resolveSlotEndMs,
  toIsoDate,
  toIsoTime,
  validatePlanningLinesNoOverlap
} = require("./helpers");
const {
  mapGardiennageRow,
  parseAuditDetails,
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
  created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/** @param {string} value @returns {string} */
function normalizeActorName(value) {
  return String(value || "").trim().toLowerCase();
}

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
    row.planningSlotStart || "", row.planningSlotEnd || "", row.createdAt, row.updatedAt
  ]);
  return result.changes;
}

/**
 * Retrouve le créateur depuis `audit_logs` PostgreSQL ; repli vide si l'audit est indisponible.
 *
 * @param {import('../../../userStore')} store
 * @param {object} row
 * @returns {Promise<string>}
 */
async function findGardiennageCreatorUsername(store, row) {
  const auditDb = typeof store.getAuditPersistence === "function" ? store.getAuditPersistence() : null;
  if (!auditDb) return "";
  const batchId = String(row.planning_batch_id || "").trim();
  const action = batchId ? "GARDIENNAGE_BATCH_CREATE" : "GARDIENNAGE_CREATE";
  try {
    const logs = await auditDb.all(
      `SELECT actor_username, details_json FROM audit_logs
       WHERE action = ? ORDER BY occurred_at DESC LIMIT 200`,
      [action]
    );
    for (const log of logs) {
      const details = parseAuditDetails(log.details_json);
      const matches = batchId
        ? String(details.batchId || "").trim() === batchId
        : String(details.id || "").trim() === String(row.id || "").trim();
      if (matches) return String(log.actor_username || "").trim();
    }
  } catch {
    return "";
  }
  return "";
}

/** @param {object} payload @param {object} normalized @param {string} id @param {string} now @returns {object} */
function makeBaseRow(payload, normalized, id, now) {
  return {
    id,
    siteId: payload.siteId || null,
    siteDisplay: String(payload.siteDisplay || "").trim(),
    startTime: normalized.startTime,
    endTime: normalized.endTime,
    crossesMidnight: normalized.endTime < normalized.startTime,
    recurrenceStartDate: normalized.recurrenceStartDate,
    recurrenceEndDate: normalized.recurrenceEndDate,
    isPonctuel: normalized.isPonctuel,
    intervenantId: payload.intervenantId || null,
    intervenantName: String(payload.intervenantName || "").trim(),
    notes: String(payload.notes || "").trim(),
    linkedInterventionId: payload.linkedInterventionId || null,
    linkedRondeId: payload.linkedRondeId || null,
    createdAt: now,
    updatedAt: now
  };
}

/** @param {import('../../../userStore')} store @param {object} payload @param {string} source @returns {object} */
function normalizeRequest(store, payload, source) {
  const startTime = toIsoTime(payload.startTime);
  const endTime = toIsoTime(payload.endTime);
  if (!startTime || !endTime) {
    store.fail(source, "Les horaires de début et de fin sont obligatoires.", "GARDIENNAGE_TIME_REQUIRED");
  }
  const recurrenceStartDate = toIsoDate(payload.recurrenceStartDate);
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
      : (toIsoDate(payload.recurrenceEndDate) || ""),
    isPonctuel
  };
}

/**
 * Refuse la clôture si H24 jusqu'à nouvel ordre (sans date de fin) ou si la fin prévue n'est pas atteinte.
 *
 * @param {import('../../../userStore')} store
 * @param {string} action - Clé d'action IPC (`gardiennage:close` / `gardiennage:setStatus`)
 * @param {object} row - Ligne SQL
 * @param {number} nowMs - Horloge
 * @returns {void}
 */
function failIfCloseNotAllowed(store, action, row, nowMs) {
  if (isManualCloseAllowed(row, nowMs)) return;
  if (isOpenEndedContinuousRow(row)) {
    store.fail(
      action,
      "Indiquez une date de fin dans la demande, enregistrez, puis clôturez après cette fin.",
      "GARDIENNAGE_CLOSE_OPEN_ENDED"
    );
  }
  const endMs = resolveSlotEndMs(row);
  const endLabel = endMs != null
    ? new Date(endMs).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })
    : "";
  store.fail(
    action,
    endLabel
      ? `La clôture est possible après la fin prévue (${endLabel}).`
      : "La clôture n'est pas encore possible : la fin prévue n'est pas atteinte.",
    "GARDIENNAGE_CLOSE_TOO_EARLY"
  );
}

/**
 * Liste les gardiennages après extension d'horizon et clôture automatique.
 *
 * @param {import('../../../userStore')} store
 * @param {{requesterRole:string}} payload
 * @returns {Promise<object[]>}
 */
async function listGardiennages(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireGardiennagePersistence(store, "gardiennage:list");
  await extendOpenEndedGardiennageHorizons(store);
  await autoCloseExpiredGardiennageEntries(store);
  const rows = await db.all(
    `SELECT * FROM gardiennage_entries
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
  const day = String(todayIso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
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
  const batchId = snapshot ? payload.id : null;
  const snapshotJson = snapshot ? JSON.stringify(snapshot) : null;
  await db.transaction(async (tx) => {
    if (await tx.get("SELECT id FROM gardiennage_entries WHERE id = ?", [payload.id])) {
      store.fail("gardiennage:create", "Ce gardiennage existe déjà.", "GARDIENNAGE_ALREADY_EXISTS");
    }
    if (!snapshot) {
      await insertGardiennageRow(tx, makeBaseRow(payload, normalized, payload.id, now));
      return;
    }
    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index];
      await insertGardiennageRow(tx, {
        ...makeBaseRow(payload, normalized, index === 0 ? payload.id : generateEntityId(), now),
        startTime: slot.startTime,
        endTime: slot.endTime,
        crossesMidnight: slot.crossesMidnight,
        recurrenceStartDate: slot.startDate,
        recurrenceEndDate: snapshot.isOpenEnded ? "" : slot.endDate,
        isPonctuel: isPonctuelPlanningSnapshot(snapshot),
        planningBatchId: batchId,
        planningSnapshotJson: snapshotJson,
        planningSlotStart: slot.startIso,
        planningSlotEnd: slot.endIso
      });
    }
  });
  if (snapshot) {
    store.logAudit({
      actorUsername: payload.requesterUsername,
      action: "GARDIENNAGE_BATCH_CREATE",
      status: "SUCCESS",
      details: {
        batchId,
        total: slots.length,
        success: slots.length,
        failed: 0,
        siteDisplay: payload.siteDisplay,
        validFrom: snapshot.validFromDate,
        validTo: snapshot.validToDate,
        isContinuous: snapshot.isContinuous,
        linesCount: snapshot.lines.length,
        linkedInterventionId: payload.linkedInterventionId || null,
        linkedRondeId: payload.linkedRondeId || null
      }
    });
  } else {
    store.logAudit({
      actorUsername: payload.requesterUsername,
      action: "GARDIENNAGE_CREATE",
      status: "SUCCESS",
      details: {
        id: payload.id,
        created: {
          siteDisplay: String(payload.siteDisplay || "").trim(),
          startTime: normalized.startTime,
          endTime: normalized.endTime,
          recurrenceStartDate: normalized.recurrenceStartDate,
          recurrenceEndDate: normalized.recurrenceEndDate,
          isPonctuel: normalized.isPonctuel,
          intervenantName: String(payload.intervenantName || "").trim(),
          status: "PLANIFIE",
          linkedInterventionId: payload.linkedInterventionId || null,
          linkedRondeId: payload.linkedRondeId || null
        }
      }
    });
  }
  return mapGardiennageRow(await db.get("SELECT * FROM gardiennage_entries WHERE id = ?", [payload.id]));
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
    const existing = await tx.get("SELECT * FROM gardiennage_entries WHERE id = ? FOR UPDATE", [payload.id]);
    if (!existing) store.fail("gardiennage:update", "Gardiennage introuvable.", "GARDIENNAGE_NOT_FOUND");
    if (String(existing.updated_at) !== String(payload.expectedUpdatedAt || "")) {
      store.fail("gardiennage:update", "Ce gardiennage a été modifié par un autre utilisateur.", "GARDIENNAGE_CONFLICT");
    }
    const batchId = String(existing.planning_batch_id || existing.id);
    if (!snapshot) {
      const result = await tx.run(
        `UPDATE gardiennage_entries SET
          site_id = ?, site_display = ?, start_time = ?, end_time = ?, crosses_midnight = ?,
          recurrence_start_date = ?, recurrence_end_date = ?, is_ponctuel = ?,
          intervenant_id = ?, intervenant_name = ?, notes = ?, intervention_id = ?, linked_ronde_id = ?,
          planning_batch_id = NULL, planning_snapshot_json = NULL,
          planning_slot_start = '', planning_slot_end = '', updated_at = ?
         WHERE id = ? AND updated_at = ?`,
        [
          payload.siteId || null, String(payload.siteDisplay || "").trim(),
          normalized.startTime, normalized.endTime, normalized.endTime < normalized.startTime ? 1 : 0,
          normalized.recurrenceStartDate, normalized.recurrenceEndDate, normalized.isPonctuel ? 1 : 0,
          payload.intervenantId || null, String(payload.intervenantName || "").trim(),
          String(payload.notes || "").trim(), payload.linkedInterventionId || null,
          payload.linkedRondeId || null, now, payload.id, payload.expectedUpdatedAt
        ]
      );
      if (!result.changes) store.fail("gardiennage:update", "Gardiennage modifié ailleurs.", "GARDIENNAGE_CONFLICT");
      return { existing, returnId: payload.id, inserted: 0, preserved: 0 };
    }
    const generated = buildGardiennageSlotsFromSnapshot(snapshot, { holidayDateIsos: holidays });
    if (!generated.length) {
      store.fail("gardiennage:update", "Aucun créneau généré avec cette validité/lignes.", "GARDIENNAGE_PLANNER_EMPTY");
    }
    const closedRows = await tx.all(
      `SELECT * FROM gardiennage_entries
       WHERE (planning_batch_id = ? OR id = ?) AND status = 'CLOTURE' FOR UPDATE`,
      [batchId, payload.id]
    );
    const slots = filterSlotsPreservingClosed(generated, closedRows);
    if (!slots.length && !closedRows.length) {
      store.fail("gardiennage:update", "Aucun créneau généré avec cette validité/lignes.", "GARDIENNAGE_PLANNER_EMPTY");
    }
    await tx.run(
      `DELETE FROM gardiennage_entries
       WHERE (planning_batch_id = ? OR id = ?) AND status <> 'CLOTURE'`,
      [batchId, payload.id]
    );
    const closedIds = new Set(closedRows.map((row) => row.id));
    let returnId = closedIds.has(payload.id) ? closedRows[0]?.id : payload.id;
    const snapshotJson = JSON.stringify(snapshot);
    const createdAt = existing.created_at || now;
    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index];
      const id = index === 0 && !closedIds.has(payload.id) ? payload.id : generateEntityId();
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
        planningSlotEnd: slot.endIso
      });
    }
    await tx.run(
      `UPDATE gardiennage_entries
       SET site_id = ?, site_display = ?, intervenant_id = ?, intervenant_name = ?, notes = ?,
           intervention_id = ?, linked_ronde_id = ?, planning_snapshot_json = ?, updated_at = ?
       WHERE (planning_batch_id = ? OR id = ?) AND status = 'CLOTURE'`,
      [
        payload.siteId || null, String(payload.siteDisplay || "").trim(),
        payload.intervenantId || null, String(payload.intervenantName || "").trim(),
        String(payload.notes || "").trim(), payload.linkedInterventionId || null,
        payload.linkedRondeId || null, snapshotJson, now, batchId, payload.id
      ]
    );
    return { existing, returnId, inserted: slots.length, preserved: closedRows.length };
  });
  const updated = await db.get("SELECT * FROM gardiennage_entries WHERE id = ?", [outcome.returnId]);
  store.logAudit({
    actorUsername: payload.requesterUsername,
    action: "GARDIENNAGE_UPDATE",
    status: "SUCCESS",
    details: {
      id: outcome.returnId,
      before: toGardiennageAuditSnapshot(mapGardiennageRow(outcome.existing)),
      after: {
        ...toGardiennageAuditSnapshot(mapGardiennageRow(updated)),
        planner: snapshot
          ? { generated: true, inserted: outcome.inserted, preservedClosed: outcome.preserved }
          : { generated: false }
      }
    }
  });
  return mapGardiennageRow(updated);
}

/**
 * Change le statut ; une annulation de lot préserve les lignes clôturées.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function setGardiennageStatus(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const db = requireGardiennagePersistence(store, "gardiennage:setStatus");
  const validStatuses = ["PLANIFIE", "ACTIF", "CLOTURE", "ANNULE"];
  if (!validStatuses.includes(payload.status)) {
    store.fail("gardiennage:setStatus", "Statut invalide.", "GARDIENNAGE_STATUS_INVALID");
  }
  const reason = String(payload.cancellationReason || "").trim();
  if (payload.status === "ANNULE" && !reason) {
    store.fail("gardiennage:setStatus", "Un motif d'annulation est obligatoire.", "GARDIENNAGE_CANCEL_REASON_REQUIRED");
  }
  const outcome = await db.transaction(async (tx) => {
    const existing = await tx.get("SELECT * FROM gardiennage_entries WHERE id = ? FOR UPDATE", [payload.id]);
    if (!existing) store.fail("gardiennage:setStatus", "Gardiennage introuvable.", "GARDIENNAGE_NOT_FOUND");
    if (String(existing.updated_at) !== String(payload.expectedUpdatedAt || "")) {
      store.fail("gardiennage:setStatus", "Ce gardiennage a été modifié. Veuillez recharger.", "GARDIENNAGE_CONFLICT");
    }
    if (payload.status === "CLOTURE") {
      failIfCloseNotAllowed(store, "gardiennage:setStatus", existing, Date.now());
    }
    const now = new Date().toISOString();
    const batchId = String(existing.planning_batch_id || "").trim();
    if (payload.status === "ANNULE" && batchId) {
      const rows = await tx.all("SELECT * FROM gardiennage_entries WHERE planning_batch_id = ? FOR UPDATE", [batchId]);
      const result = await tx.run(
        `UPDATE gardiennage_entries
         SET status = 'ANNULE', cancellation_reason = ?, updated_at = ?
         WHERE planning_batch_id = ? AND status <> 'CLOTURE'`,
        [reason, now, batchId]
      );
      return {
        existing,
        batchId,
        cancelledCount: result.changes,
        preservedClosedCount: rows.filter((row) => row.status === "CLOTURE").length
      };
    }
    const result = await tx.run(
      `UPDATE gardiennage_entries SET status = ?, cancellation_reason = ?, updated_at = ?
       WHERE id = ? AND updated_at = ?`,
      [
        payload.status,
        payload.status === "ANNULE" ? reason : String(existing.cancellation_reason || ""),
        now,
        payload.id,
        payload.expectedUpdatedAt
      ]
    );
    if (!result.changes) store.fail("gardiennage:setStatus", "Gardiennage modifié ailleurs.", "GARDIENNAGE_CONFLICT");
    return { existing, batchId: "" };
  });
  const updated = mapGardiennageRow(await db.get("SELECT * FROM gardiennage_entries WHERE id = ?", [payload.id]));
  if (outcome.batchId) {
    store.logAudit({
      actorUsername: payload.requesterUsername,
      action: "GARDIENNAGE_BATCH_CANCEL",
      status: "SUCCESS",
      details: {
        id: payload.id,
        batchId: outcome.batchId,
        reason,
        cancelledCount: outcome.cancelledCount,
        preservedClosedCount: outcome.preservedClosedCount
      }
    });
    return {
      ...updated,
      batchOperation: {
        type: "CANCEL",
        isBatch: true,
        cancelledCount: outcome.cancelledCount,
        preservedClosedCount: outcome.preservedClosedCount
      }
    };
  }
  const actions = {
    PLANIFIE: "GARDIENNAGE_STATUS_PLANIFIE",
    ACTIF: "GARDIENNAGE_STATUS_ACTIF",
    CLOTURE: "GARDIENNAGE_STATUS_CLOTURE",
    ANNULE: "GARDIENNAGE_STATUS_ANNULE"
  };
  store.logAudit({
    actorUsername: payload.requesterUsername,
    action: actions[payload.status] || "GARDIENNAGE_STATUS_CHANGE",
    status: "SUCCESS",
    details: {
      id: payload.id,
      before: outcome.existing.status,
      after: payload.status,
      ...(payload.status === "ANNULE" ? { cancellationReason: reason } : {})
    }
  });
  return updated;
}

/**
 * Clôture une fiche gardiennage (prestation H24 entière, ou une nuit).
 * Interdit tant que la fin prévue n'est pas atteinte.
 * H24 jusqu'à nouvel ordre : poser une date de fin dans la demande, enregistrer, puis clôturer après cette fin.
 * Ne glisse plus les dates de récurrence.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function closeGardiennage(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const db = requireGardiennagePersistence(store, "gardiennage:close");
  const now = new Date();
  const nowIso = now.toISOString();
  const existing = await db.transaction(async (tx) => {
    const row = await tx.get("SELECT * FROM gardiennage_entries WHERE id = ? FOR UPDATE", [payload.id]);
    if (!row) store.fail("gardiennage:close", "Gardiennage introuvable.", "GARDIENNAGE_NOT_FOUND");
    if (String(row.updated_at) !== String(payload.expectedUpdatedAt || "")) {
      store.fail("gardiennage:close", "Ce gardiennage a été modifié. Veuillez recharger.", "GARDIENNAGE_CONFLICT");
    }
    if (row.status === "ANNULE") {
      store.fail("gardiennage:close", "Un gardiennage annulé ne peut pas être clôturé.", "GARDIENNAGE_STATUS_INVALID");
    }
    if (row.status === "CLOTURE") {
      store.fail("gardiennage:close", "Ce gardiennage est déjà clôturé.", "GARDIENNAGE_STATUS_INVALID");
    }
    failIfCloseNotAllowed(store, "gardiennage:close", row, now.getTime());
    const result = await tx.run(
      `UPDATE gardiennage_entries
       SET status = 'CLOTURE', closure_report = ?, actual_start_time = ?,
           actual_end_time = ?, work_order_number = ?, updated_at = ?
       WHERE id = ? AND updated_at = ?`,
      [
        String(payload.closureReport || "").trim(),
        toIsoTime(payload.actualStartTime),
        toIsoTime(payload.actualEndTime),
        String(payload.workOrderNumber || "").trim(),
        nowIso,
        payload.id,
        payload.expectedUpdatedAt
      ]
    );
    if (!result.changes) store.fail("gardiennage:close", "Gardiennage modifié ailleurs.", "GARDIENNAGE_CONFLICT");
    return row;
  });
  const updated = mapGardiennageRow(await db.get("SELECT * FROM gardiennage_entries WHERE id = ?", [payload.id]));
  store.logAudit({
    actorUsername: payload.requesterUsername,
    action: "GARDIENNAGE_STATUS_CLOTURE",
    status: "SUCCESS",
    details: {
      id: payload.id,
      siteDisplay: existing.site_display,
      closeDate: toIsoDate(payload.closeDate) || nowIso.slice(0, 10),
      before: { status: existing.status, recurrenceStartDate: existing.recurrence_start_date },
      after: { status: updated.status, recurrenceStartDate: updated.recurrenceStartDate }
    }
  });
  return updated;
}

/**
 * Rouvre un gardiennage clôturé ou annulé.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function reopenGardiennage(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const db = requireGardiennagePersistence(store, "gardiennage:reopen");
  const existing = await db.get("SELECT * FROM gardiennage_entries WHERE id = ?", [payload.id]);
  if (!existing) store.fail("gardiennage:reopen", "Gardiennage introuvable.", "GARDIENNAGE_NOT_FOUND");
  if (!["CLOTURE", "ANNULE"].includes(existing.status)) {
    store.fail("gardiennage:reopen", "Seul un gardiennage annulé ou clôturé peut être rouvert.", "GARDIENNAGE_STATUS_INVALID");
  }
  const result = await db.run(
    `UPDATE gardiennage_entries
     SET status = 'PLANIFIE', closure_report = '', actual_start_time = '', actual_end_time = '',
         work_order_number = '', cancellation_reason = '', updated_at = ?
     WHERE id = ? AND updated_at = ?`,
    [new Date().toISOString(), payload.id, payload.expectedUpdatedAt]
  );
  if (!result.changes) store.fail("gardiennage:reopen", "Gardiennage modifié ailleurs.", "GARDIENNAGE_CONFLICT");
  store.logAudit({
    actorUsername: payload.requesterUsername,
    action: "GARDIENNAGE_REOPEN",
    status: "SUCCESS",
    details: {
      id: payload.id,
      siteDisplay: existing.site_display,
      before: { status: existing.status, cancellationReason: existing.cancellation_reason || "" },
      after: { status: "PLANIFIE", cancellationReason: "" }
    }
  });
  return mapGardiennageRow(await db.get("SELECT * FROM gardiennage_entries WHERE id = ?", [payload.id]));
}

/**
 * Supprime une entrée ou les lignes non clôturées de son lot.
 *
 * Les opérateurs ne peuvent supprimer que leurs propres créations, identifiées dans
 * le journal PostgreSQL. Un audit indisponible provoque donc un refus prudent.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<{success:boolean,batchId:string|null,deletedCount:number,preservedClosedCount:number}>}
 */
async function deleteGardiennage(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const reason = String(payload.reason || "").trim();
  if (!reason) store.fail("gardiennage:delete", "Un motif de suppression est obligatoire.", "DATA_DELETE_REASON_REQUIRED");
  const db = requireGardiennagePersistence(store, "gardiennage:delete");
  const existing = await db.get("SELECT * FROM gardiennage_entries WHERE id = ?", [payload.id]);
  if (!existing) store.fail("gardiennage:delete", "Gardiennage introuvable.", "GARDIENNAGE_NOT_FOUND");
  const batchId = String(existing.planning_batch_id || "").trim();
  const scope = batchId
    ? await db.all("SELECT * FROM gardiennage_entries WHERE planning_batch_id = ?", [batchId])
    : [existing];
  const deletable = scope.filter((row) => row.status !== "CLOTURE");
  const preserved = scope.filter((row) => row.status === "CLOTURE");
  if (!deletable.length) {
    store.fail("gardiennage:delete", "Aucune entrée supprimable dans ce lot.", "GARDIENNAGE_DELETE_NOTHING_TO_DELETE");
  }
  const isManager = payload.requesterRole === "RESPONSABLE" || payload.requesterRole === "DEV";
  if (!isManager) {
    for (const row of deletable) {
      const creator = await findGardiennageCreatorUsername(store, row);
      if (!creator || normalizeActorName(creator) !== normalizeActorName(payload.requesterUsername)) {
        store.fail(
          "gardiennage:delete",
          "Suppression refusée : vous ne pouvez supprimer que vos propres créations.",
          "GARDIENNAGE_DELETE_FORBIDDEN_NOT_OWNER"
        );
      }
    }
  }
  const result = batchId
    ? await db.run(
      "DELETE FROM gardiennage_entries WHERE planning_batch_id = ? AND status <> 'CLOTURE'",
      [batchId]
    )
    : await db.run("DELETE FROM gardiennage_entries WHERE id = ?", [payload.id]);
  if (result.changes !== deletable.length) {
    store.fail("gardiennage:delete", "Le gardiennage a été modifié pendant la suppression.", "GARDIENNAGE_CONFLICT");
  }
  store.logAudit({
    actorUsername: payload.requesterUsername,
    action: batchId ? "GARDIENNAGE_BATCH_DELETE" : "GARDIENNAGE_DELETE",
    status: "SUCCESS",
    details: {
      id: payload.id,
      batchId: batchId || null,
      deletedCount: result.changes,
      preservedClosedCount: preserved.length,
      deleted: {
        siteDisplay: existing.site_display,
        startTime: existing.start_time,
        endTime: existing.end_time
      },
      reason
    }
  });
  return {
    success: true,
    batchId: batchId || null,
    deletedCount: result.changes,
    preservedClosedCount: preserved.length
  };
}

module.exports = {
  closeGardiennage,
  createGardiennage,
  deleteGardiennage,
  getGardiennageTodayInProgressCount,
  listGardiennages,
  reopenGardiennage,
  setGardiennageStatus,
  updateGardiennage
};
