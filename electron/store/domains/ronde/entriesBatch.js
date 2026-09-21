/**
 * Opérations de lot des rondes exceptionnelles (mise à jour, annulation, suppression).
 *
 * Utilisé par la façade `ronde/index.js`. Helpers : `entriesShared.js`.
 *
 * @module electron/store/domains/ronde/entriesBatch
 */

const holidaysDomain = require("../data/holidays");
const exceptionalSlots = require("./exceptionalSlotsEngine");
const { parseJsonObject, parseBatchDeleteEntryIds, toRondeAuditSnapshot, RONDE_ENTRY_SELECT } = require("./mapping");
const { requireRondePersistence } = require("./persistence");
const { generateEntityId } = require("../../core/ids");
const { allocateNextDailyCode } = require("../../core/dailyEntryCode");
const {
  hasKnownTerrainData,
  isBatchFullyPast,
  isRondeManagerRole
} = require("./passageRules");
const {
  INSERT_SQL,
  TIME_RE,
  normalizeRondeBody,
  resolveRondeDailyCodeDayIso,
  normalizePlanningSnapshot
} = require("./entriesShared");

/**
 * Vérifie qu'un ensemble de fiches forme un lot exceptionnel cohérent.
 *
 * @param {object} store
 * @param {object[]} rows
 * @returns {void}
 */
function assertCoherentExceptionalBatch(store, rows) {
  if (!rows.length) store.fail("ronde:batch", "Aucune ronde sélectionnée.", "RONDE_BATCH_EMPTY");
  if (rows.some((row) => row.source === "PLANIFIE")) {
    store.fail("ronde:batch", "Ce regroupement ne s'applique pas aux rondes planifiées.", "RONDE_BATCH_PLANNED_FORBIDDEN");
  }
  const batchIds = rows.map((row) => String(row.request_batch_id || "").trim()).filter(Boolean);
  if (batchIds.length === rows.length && new Set(batchIds).size === 1) return;
  if (batchIds.length) store.fail("ronde:batch", "Les rondes ne font pas partie du même lot.", "RONDE_BATCH_MISMATCH");
  const snapshots = rows.map((row) => String(row.request_planning_snapshot_json || "").trim());
  const sites = rows.map((row) => String(row.site_id || ""));
  if (rows.length === 1 || (snapshots.every(Boolean) && new Set(snapshots).size === 1 && new Set(sites).size === 1)) return;
  store.fail("ronde:batch", "Impossible de regrouper automatiquement ces fiches.", "RONDE_BATCH_INCOHERENT");
}

/**
 * Charge des fiches ronde par id (colonnes explicites).
 *
 * @param {import('../../persistence/persistenceContract').PersistenceAdapter} db
 * @param {string[]} ids
 * @param {{ forUpdate?: boolean }} [options]
 * @returns {Promise<object[]>}
 */
async function loadBatchRows(db, ids, { forUpdate = false } = {}) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(", ");
  const lock = forUpdate ? " FOR UPDATE" : "";
  return db.all(
    `SELECT ${RONDE_ENTRY_SELECT} FROM ronde_entries WHERE id IN (${placeholders})${lock}`,
    ids
  );
}

/** @param {string} dateIso @param {string} timeHm @returns {string} */
function formatDemandContext(dateIso, timeHm) {
  const date = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  const label = date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return timeHm ? `Demande émise le ${label} à ${timeHm}` : `Demande émise le ${label}`;
}

/**
 * Met à jour les champs communs d'un lot et resynchronise ses créneaux si demandé.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<{ok:boolean,updatedCount:number}>}
 */
async function updateRondeBatchSharedFields(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const db = requireRondePersistence(store, "ronde:batch");
  const ids = [...new Set((payload.entryIds || []).map((id) => String(id).trim()).filter(Boolean))];
  let rows = await loadBatchRows(db, ids);
  if (rows.length !== ids.length) store.fail("ronde:batch", "Ronde introuvable.", "RONDE_NOT_FOUND");
  assertCoherentExceptionalBatch(store, rows);
  const snapshotProvided = Object.prototype.hasOwnProperty.call(payload, "requestPlanningSnapshotJson");
  let snapshotJson = null;
  let planningResync = null;
  if (snapshotProvided) {
    snapshotJson = normalizePlanningSnapshot(payload.requestPlanningSnapshotJson, "URGENCE", store);
    if (!snapshotJson) store.fail("ronde:batch", "Instantané de demande invalide.", "RONDE_BATCH_SNAPSHOT_INVALID");
    const snapshot = JSON.parse(snapshotJson);
    if (snapshot.createRoundsEnabled !== false && snapshot.origin !== "CONTRAT") {
      const desired = exceptionalSlots.buildDesiredExceptionalSlotList(
        snapshot,
        new Set(holidaysDomain.getHolidayDateIsosForPlanning(store))
      );
      if (!desired.length) store.fail("ronde:batch", "Aucun créneau ne peut être calculé.", "RONDE_BATCH_RESYNC_EMPTY");
      const multiset = new Map();
      exceptionalSlots.multisetAddMany(multiset, desired);
      for (const row of rows.filter((item) => item.status === "CLOTURE")) {
        exceptionalSlots.multisetConsumeOne(
          multiset,
          exceptionalSlots.extractSlotKeyFromRondeObservation(row.request_date, row.horaires_demande_obs)
        );
      }
      const toDelete = [];
      for (const row of rows.filter((item) => item.status !== "CLOTURE")) {
        const key = exceptionalSlots.extractSlotKeyFromRondeObservation(row.request_date, row.horaires_demande_obs);
        if (!exceptionalSlots.multisetConsumeOne(multiset, key)) toDelete.push(row.id);
      }
      const template = rows[0];
      const normalized = await normalizeRondeBody(store, db, {
        ...payload, requestDate: template.request_date, horairesDemandeObs: template.horaires_demande_obs,
        arrivalTime: "", departureTime: "", workOrderNumber: "", report: "", closureCustomValues: {}
      });
      const createdIds = [];
      await db.transaction(async (tx) => {
        await loadBatchRows(tx, ids, { forUpdate: true });
        if (toDelete.length) {
          const placeholders = toDelete.map(() => "?").join(", ");
          await tx.run(`DELETE FROM ronde_entries WHERE id IN (${placeholders})`, toDelete);
        }
        for (const [slotKey, quantity] of [...multiset.entries()].sort()) {
          for (let index = 0; index < quantity; index += 1) {
            const [requestDate, requestedTime = ""] = slotKey.split("|");
            const id = generateEntityId();
            const now = new Date().toISOString();
            const observation = [
              formatDemandContext(snapshot.requestDate || requestDate, TIME_RE.test(snapshot.requestTime) ? snapshot.requestTime : "00:00"),
              requestedTime ? `Heure demandée: ${requestedTime}` : "",
              String(snapshot.consigne || "").trim()
            ].filter(Boolean).join(" — ");
            await tx.run(INSERT_SQL, [
              id, now, now, template.source || "URGENCE", template.origin_intervention_id || null,
              normalized.siteId, normalized.siteDisplay, requestDate, normalized.motifTypeId,
              normalized.motifCategorySnapshot, normalized.motifOther || null, observation,
              normalized.originKind, normalized.originDetail || null, normalized.intervenantId,
              normalized.intervenantName, null, null, null, null, null, "{}", null, null, null,
              snapshotJson, template.request_batch_id || null, "EN_COURS", null, null,
              await allocateNextDailyCode(
                tx,
                "ronde",
                resolveRondeDailyCodeDayIso(template.source || "URGENCE", requestDate, snapshotJson)
              )
            ]);
            createdIds.push(id);
          }
        }
      });
      rows = await loadBatchRows(db, [...ids.filter((id) => !toDelete.includes(id)), ...createdIds]);
      planningResync = { deletedStalePasses: toDelete.length, createdPasses: createdIds.length };
    }
  }
  const summaries = [];
  const now = new Date().toISOString();
  const updatedIds = rows.map((row) => row.id);
  await db.transaction(async (tx) => {
    const lockedRows = await loadBatchRows(tx, updatedIds, { forUpdate: true });
    for (const row of lockedRows) {
      const normalized = await normalizeRondeBody(store, tx, {
        ...payload, requestDate: row.request_date, horairesDemandeObs: row.horaires_demande_obs,
        arrivalTime: row.arrival_time || "", departureTime: row.departure_time || "",
        workOrderNumber: row.work_order_number || "", report: row.report || "",
        closureCustomValues: parseJsonObject(row.closure_custom_values_json, {})
      });
      await tx.run(
        `UPDATE ronde_entries SET updated_at = ?, site_id = ?, site_display = ?, motif_type_id = ?,
         motif_category = ?, motif_other = ?, origin_kind = ?, origin_detail = ?,
         intervenant_id = ?, intervenant_name = ?, request_planning_snapshot_json = ? WHERE id = ?`,
        [now, normalized.siteId, normalized.siteDisplay, normalized.motifTypeId,
          normalized.motifCategorySnapshot, normalized.motifOther || null, normalized.originKind,
          normalized.originDetail || null, normalized.intervenantId, normalized.intervenantName,
          snapshotProvided ? snapshotJson : row.request_planning_snapshot_json, row.id]
      );
      summaries.push({ id: row.id, before: toRondeAuditSnapshot(row), after: {
        ...toRondeAuditSnapshot(row), siteDisplay: normalized.siteDisplay,
        motifLabel: normalized.motifCategorySnapshot, intervenantName: normalized.intervenantName
      } });
    }
  });
  store.logAudit({
    actorUsername: payload.requesterUsername || "unknown",
    action: "RONDE_BATCH_UPDATE",
    details: { count: summaries.length, entryIds: summaries.map((row) => row.id),
      planningSnapshotSynced: snapshotProvided, planningResync, rows: summaries.slice(0, 25) }
  });
  return { ok: true, updatedCount: summaries.length };
}

/**
 * Annule les rondes ouvertes d'un lot.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function bulkCancelRondeBatch(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  if (!isRondeManagerRole(payload.requesterRole)) {
    store.fail(
      "ronde:batch",
      "L'annulation en lot est réservée au responsable. Marquez les rondes une par une en « non effectuée ».",
      "RONDE_BATCH_CANCEL_OPERATOR_FORBIDDEN"
    );
  }
  const reason = String(payload.reason || "").trim();
  if (!reason) store.fail("ronde:batch", "Le motif d'annulation est obligatoire.", "RONDE_BATCH_CANCEL_REASON_REQUIRED");
  const db = requireRondePersistence(store, "ronde:batch");
  const ids = [...new Set((payload.entryIds || []).map((id) => String(id).trim()).filter(Boolean))];
  const rows = await loadBatchRows(db, ids);
  if (rows.length !== ids.length) store.fail("ronde:batch", "Ronde introuvable.", "RONDE_NOT_FOUND");
  assertCoherentExceptionalBatch(store, rows);
  const openRows = rows.filter((row) => row.status === "EN_COURS");
  if (openRows.length) {
    const now = new Date().toISOString();
    await db.transaction(async (tx) => {
      await loadBatchRows(
        tx,
        openRows.map((r) => r.id),
        { forUpdate: true }
      );
      for (const row of openRows) {
        await tx.run(
          `UPDATE ronde_entries SET status = 'ANNULE', cancellation_reason = ?, cancellation_kind = 'ANNULATION',
           closed_at = ?, updated_at = ? WHERE id = ? AND status = 'EN_COURS'`,
          [reason, now, now, row.id]
        );
      }
    });
  }
  store.logAudit({
    actorUsername: payload.requesterUsername || "unknown",
    action: "RONDE_BATCH_CANCEL",
    details: {
      reason,
      cancelledCount: openRows.length,
      skippedCount: rows.length - openRows.length,
      entryIds: openRows.map((r) => r.id)
    }
  });
  return { ok: true, cancelledCount: openRows.length, skippedCount: rows.length - openRows.length };
}

/**
 * @param {import('../../../userStore')} store
 * @param {object} db
 * @param {object[]} rows
 * @param {string} reason
 * @param {string} actor
 */
async function applySmartBatchDelete(store, db, rows, reason, actor) {
  const now = new Date().toISOString();
  const fullyPast = isBatchFullyPast(rows);
  let deletedCount = 0;
  let nonEffectueeCount = 0;
  let suppressedCount = 0;
  const closedRows = rows.filter((row) => row.status === "CLOTURE");

  if (fullyPast) {
    const deletable = rows.filter((row) => row.status !== "CLOTURE");
    await db.transaction(async (tx) => {
      for (const row of closedRows) {
        const snapshot = parseJsonObject(row.request_planning_snapshot_json, null);
        if (snapshot?.version === 1 && snapshot.createRoundsEnabled !== false) {
          snapshot.createRoundsEnabled = false;
          await tx.run(
            "UPDATE ronde_entries SET request_planning_snapshot_json = ?, updated_at = ? WHERE id = ?",
            [JSON.stringify(snapshot), now, row.id]
          );
        }
      }
      if (deletable.length) {
        const placeholders = deletable.map(() => "?").join(", ");
        await tx.run(
          `DELETE FROM ronde_entries WHERE id IN (${placeholders})`,
          deletable.map((row) => row.id)
        );
        deletedCount = deletable.length;
      }
    });
    return { deletedCount, nonEffectueeCount: 0, suppressedCount: 0, skippedCount: closedRows.length };
  }

  await db.transaction(async (tx) => {
    for (const row of rows) {
      if (row.status === "CLOTURE" || hasKnownTerrainData(row)) {
        const snapshot = parseJsonObject(row.request_planning_snapshot_json, null);
        let snapJson = null;
        if (snapshot?.version === 1 && snapshot.createRoundsEnabled !== false) {
          snapshot.createRoundsEnabled = false;
          snapJson = JSON.stringify(snapshot);
        }
        await tx.run(
          `UPDATE ronde_entries SET
             batch_suppressed_at = ?, batch_suppressed_by = ?, batch_suppressed_reason = ?,
             request_planning_snapshot_json = COALESCE(?, request_planning_snapshot_json),
             updated_at = ?
           WHERE id = ?`,
          [now, actor, reason, snapJson, now, row.id]
        );
        suppressedCount += 1;
      } else if (row.status === "EN_COURS") {
        await tx.run(
          `UPDATE ronde_entries SET status = 'ANNULE', cancellation_reason = ?, cancellation_kind = 'NON_EFFECTUEE',
           closed_at = ?, batch_suppressed_at = ?, batch_suppressed_by = ?, batch_suppressed_reason = ?, updated_at = ?
           WHERE id = ?`,
          [reason, now, now, actor, reason, now, row.id]
        );
        nonEffectueeCount += 1;
      } else {
        await tx.run(
          `UPDATE ronde_entries SET batch_suppressed_at = ?, batch_suppressed_by = ?, batch_suppressed_reason = ?, updated_at = ?
           WHERE id = ?`,
          [now, actor, reason, now, row.id]
        );
        suppressedCount += 1;
      }
    }
  });
  return { deletedCount, nonEffectueeCount, suppressedCount, skippedCount: closedRows.length };
}

async function bulkDeleteRondeBatch(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  if (!isRondeManagerRole(payload.requesterRole)) {
    store.fail(
      "ronde:batch",
      "La suppression de lot est réservée au responsable. Déposez une demande de suppression.",
      "RONDE_BATCH_DELETE_OPERATOR_FORBIDDEN"
    );
  }
  const reason = String(payload.reason || "").trim();
  if (!reason) store.fail("ronde:batch", "Le motif de suppression est obligatoire.", "RONDE_BATCH_DELETE_REASON_REQUIRED");
  const db = requireRondePersistence(store, "ronde:batch");
  const ids = [...new Set((payload.entryIds || []).map((id) => String(id).trim()).filter(Boolean))];
  const rows = await loadBatchRows(db, ids);
  if (rows.length !== ids.length) store.fail("ronde:batch", "Ronde introuvable.", "RONDE_NOT_FOUND");
  assertCoherentExceptionalBatch(store, rows);
  const actor = String(payload.requesterUsername || "unknown").trim();
  const result = await applySmartBatchDelete(store, db, rows, reason, actor);
  const batchId = String(rows[0]?.request_batch_id || "").trim();
  if (batchId) {
    await db.run(`DELETE FROM ronde_batch_delete_requests WHERE request_batch_id = ?`, [batchId]);
  }
  store.logAudit({
    actorUsername: actor,
    action: "RONDE_BATCH_DELETE",
    details: { reason, ...result, batchId: batchId || null }
  });
  return { ok: true, deletedCount: result.deletedCount, skippedCount: result.skippedCount, ...result };
}

async function requestRondeBatchDelete(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  if (isRondeManagerRole(payload.requesterRole)) {
    store.fail(
      "ronde:batchDeleteRequest",
      "Un responsable peut supprimer le lot directement sans créer de demande.",
      "RONDE_BATCH_DELETE_REQUEST_NOT_NEEDED"
    );
  }
  const reason = String(payload.reason || "").trim();
  if (!reason) {
    store.fail("ronde:batchDeleteRequest", "Le motif de demande est obligatoire.", "RONDE_BATCH_DELETE_REASON_REQUIRED");
  }
  const db = requireRondePersistence(store, "ronde:batchDeleteRequest");
  const ids = [...new Set((payload.entryIds || []).map((id) => String(id).trim()).filter(Boolean))];
  if (!ids.length) {
    store.fail("ronde:batchDeleteRequest", "Sélectionnez au moins une ronde en cours.", "RONDE_BATCH_DELETE_EMPTY");
  }
  const rows = await loadBatchRows(db, ids);
  if (rows.length !== ids.length) store.fail("ronde:batchDeleteRequest", "Ronde introuvable.", "RONDE_NOT_FOUND");
  assertCoherentExceptionalBatch(store, rows);
  if (rows.some((row) => row.status !== "EN_COURS")) {
    store.fail(
      "ronde:batchDeleteRequest",
      "Seules les rondes en cours peuvent faire l'objet d'une demande de suppression.",
      "RONDE_BATCH_DELETE_STATUS_INVALID"
    );
  }
  const batchId = String(rows[0]?.request_batch_id || "").trim();
  if (!batchId) {
    store.fail("ronde:batchDeleteRequest", "Ce regroupement n'a pas d'identifiant de lot.", "RONDE_BATCH_ID_REQUIRED");
  }
  const existing = await db.get(
    "SELECT request_batch_id, status FROM ronde_batch_delete_requests WHERE request_batch_id = ?",
    [batchId]
  );
  if (existing?.status === "PENDING") {
    store.fail(
      "ronde:batchDeleteRequest",
      "Une demande de suppression est déjà en attente pour ce lot.",
      "RONDE_BATCH_DELETE_ALREADY_PENDING"
    );
  }
  const now = new Date().toISOString();
  const actor = String(payload.requesterUsername || "unknown").trim();
  const siteDisplay = String(rows[0]?.site_display || "").trim();
  const entryIdsJson = JSON.stringify(ids);
  if (existing) {
    await db.run(
      `UPDATE ronde_batch_delete_requests
       SET reason = ?, requested_at = ?, requested_by = ?, status = 'PENDING',
           reviewed_at = NULL, reviewed_by = NULL, review_reason = NULL, site_display = ?,
           entry_ids_json = ?
       WHERE request_batch_id = ?`,
      [reason, now, actor, siteDisplay, entryIdsJson, batchId]
    );
  } else {
    await db.run(
      `INSERT INTO ronde_batch_delete_requests
         (request_batch_id, reason, requested_at, requested_by, status, site_display, entry_ids_json)
       VALUES (?, ?, ?, ?, 'PENDING', ?, ?)`,
      [batchId, reason, now, actor, siteDisplay, entryIdsJson]
    );
  }
  store.logAudit({
    actorUsername: actor,
    action: "RONDE_BATCH_DELETE_REQUEST",
    details: { batchId, reason, entryCount: rows.length, entryIds: ids }
  });
  return { ok: true, requestBatchId: batchId, requestedAt: now, requestedBy: actor, reason, entryIds: ids };
}

async function reviewRondeBatchDeleteRequest(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  if (!isRondeManagerRole(payload.requesterRole)) {
    store.fail(
      "ronde:batchDeleteReview",
      "Seul un responsable peut traiter une demande de suppression.",
      "RONDE_BATCH_DELETE_REVIEW_FORBIDDEN"
    );
  }
  const batchId = String(payload.requestBatchId || "").trim();
  const decision = String(payload.decision || "").trim().toLowerCase();
  const reviewReason = String(payload.reviewReason || payload.reason || "").trim();
  if (!batchId) store.fail("ronde:batchDeleteReview", "Lot manquant.", "RONDE_BATCH_ID_REQUIRED");
  if (decision !== "approve" && decision !== "reject") {
    store.fail("ronde:batchDeleteReview", "Décision invalide.", "RONDE_BATCH_DELETE_DECISION_INVALID");
  }
  if (!reviewReason) {
    store.fail("ronde:batchDeleteReview", "Le motif de décision est obligatoire.", "RONDE_BATCH_DELETE_REASON_REQUIRED");
  }
  const db = requireRondePersistence(store, "ronde:batchDeleteReview");
  const pending = await db.get(
    "SELECT * FROM ronde_batch_delete_requests WHERE request_batch_id = ? AND status = 'PENDING'",
    [batchId]
  );
  if (!pending) {
    store.fail("ronde:batchDeleteReview", "Aucune demande en attente pour ce lot.", "RONDE_BATCH_DELETE_NOT_FOUND");
  }
  const actor = String(payload.requesterUsername || "unknown").trim();
  const now = new Date().toISOString();
  if (decision === "reject") {
    await db.run(
      `UPDATE ronde_batch_delete_requests
       SET status = 'REJECTED', reviewed_at = ?, reviewed_by = ?, review_reason = ?
       WHERE request_batch_id = ?`,
      [now, actor, reviewReason, batchId]
    );
    store.logAudit({
      actorUsername: actor,
      action: "RONDE_BATCH_DELETE_REQUEST_REJECT",
      details: { batchId, reviewReason, request: { reason: pending.reason, requestedBy: pending.requested_by } }
    });
    return { ok: true, decision: "reject", requestBatchId: batchId };
  }
  const rowsAll = await db.all(`SELECT ${RONDE_ENTRY_SELECT} FROM ronde_entries WHERE request_batch_id = ?`, [batchId]);
  const scopedIds = parseBatchDeleteEntryIds(pending.entry_ids_json);
  const rows = scopedIds
    ? rowsAll.filter((row) => scopedIds.includes(String(row.id || "").trim()))
    : rowsAll;
  if (!rows.length) {
    await db.run(`DELETE FROM ronde_batch_delete_requests WHERE request_batch_id = ?`, [batchId]);
    store.fail("ronde:batchDeleteReview", "Aucune fiche restante pour cette demande.", "RONDE_BATCH_EMPTY");
  }
  const applyReason = String(pending.reason || reviewReason).trim();
  const result = await applySmartBatchDelete(store, db, rows, applyReason, actor);
  await db.run(
    `UPDATE ronde_batch_delete_requests
     SET status = 'APPROVED', reviewed_at = ?, reviewed_by = ?, review_reason = ?
     WHERE request_batch_id = ?`,
    [now, actor, reviewReason, batchId]
  );
  store.logAudit({
    actorUsername: actor,
    action: "RONDE_BATCH_DELETE_REQUEST_APPROVE",
    details: { batchId, reviewReason, requestReason: pending.reason, ...result }
  });
  return { ok: true, decision: "approve", requestBatchId: batchId, ...result };
}

async function listRondeBatchDeleteRequests(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  if (!isRondeManagerRole(requesterRole)) {
    store.fail(
      "ronde:batchDeleteList",
      "Seul un responsable peut consulter les demandes de suppression.",
      "RONDE_BATCH_DELETE_LIST_FORBIDDEN"
    );
  }
  const db = requireRondePersistence(store, "ronde:batchDeleteList");
  const requests = await db.all(
    `SELECT request_batch_id, reason, requested_at, requested_by, status,
            reviewed_at, reviewed_by, review_reason, site_display, entry_ids_json
     FROM ronde_batch_delete_requests
     ORDER BY CASE status WHEN 'PENDING' THEN 0 WHEN 'REJECTED' THEN 1 ELSE 2 END,
              requested_at DESC`,
    []
  );
  const usersDb = typeof store.getUsersPersistence === "function" ? store.getUsersPersistence() : null;
  const displayByUsername = new Map();
  if (usersDb && usersDb.isOpen()) {
    const usernames = [
      ...new Set(
        requests
          .flatMap((req) => [req.requested_by, req.reviewed_by])
          .map((u) => String(u || "").trim())
          .filter(Boolean)
      )
    ];
    for (const username of usernames) {
      const row = await usersDb.get("SELECT full_name FROM users WHERE username = ?", [username]);
      const fullName = String(row?.full_name || "").trim();
      if (fullName) displayByUsername.set(username, fullName);
    }
  }
  const out = [];
  for (const req of requests) {
    const scopedIds = parseBatchDeleteEntryIds(req.entry_ids_json);
    let entries = await db.all(
      `SELECT ${RONDE_ENTRY_SELECT} FROM ronde_entries WHERE request_batch_id = ? ORDER BY request_date ASC`,
      [req.request_batch_id]
    );
    if (scopedIds) {
      const allowed = new Set(scopedIds);
      entries = entries.filter((e) => allowed.has(String(e.id || "").trim()));
    }
    const requestedBy = String(req.requested_by || "").trim();
    const reviewedBy = String(req.reviewed_by || "").trim();
    out.push({
      requestBatchId: req.request_batch_id,
      reason: req.reason || "",
      requestedAt: req.requested_at,
      requestedBy,
      requestedByDisplay: displayByUsername.get(requestedBy) || requestedBy,
      status: req.status || "PENDING",
      reviewedAt: req.reviewed_at || null,
      reviewedBy,
      reviewedByDisplay: reviewedBy ? displayByUsername.get(reviewedBy) || reviewedBy : "",
      reviewReason: req.review_reason || "",
      entryCount: entries.length || (scopedIds ? scopedIds.length : 0),
      siteDisplay: String(req.site_display || "").trim() || entries[0]?.site_display || "",
      dateFrom: entries[0]?.request_date || "",
      dateTo: entries.length ? entries[entries.length - 1].request_date : "",
      entryIds: entries.length ? entries.map((e) => e.id) : scopedIds || []
    });
  }
  return out;
}

module.exports = {
  bulkCancelRondeBatch,
  bulkDeleteRondeBatch,
  listRondeBatchDeleteRequests,
  requestRondeBatchDelete,
  reviewRondeBatchDeleteRequest,
  updateRondeBatchSharedFields
};
