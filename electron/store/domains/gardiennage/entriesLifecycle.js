/**
 * Statuts, clôture, réouverture et suppression des gardiennages PostgreSQL.
 *
 * CRUD liste / création / mise à jour : `entries.js`.
 *
 * @module electron/store/domains/gardiennage/entriesLifecycle
 */

const { actorName } = require("../../core/actorName");
const { normalizeDateIso } = require("../../core/isoDate");
const {
  isManualCloseAllowed,
  isOpenEndedContinuousRow,
  resolveSlotEndMs,
  toIsoTime
} = require("./helpers");
const {
  GARDIENNAGE_ENTRY_SELECT,
  mapGardiennageRow,
  parseAuditDetails,
  requireEntryId,
  toGardiennageAuditSnapshot
} = require("./mapping");
const { requireGardiennagePersistence } = require("./persistence");

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeActorName(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Retrouve le créateur depuis `audit_logs` ; repli vide si l'audit est indisponible.
 * Scan limité (200 derniers logs) : un journal très ancien peut masquer le créateur.
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
 * Change le statut ; une annulation de lot préserve les lignes clôturées.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<object>}
 */
async function setGardiennageStatus(store, payload) {
  store.ensureDataReaderRole(payload.requesterRole);
  const actor = actorName(payload.requesterUsername);
  const entryId = requireEntryId(store, payload, "gardiennage:setStatus");
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
    const existing = await tx.get(
      `SELECT ${GARDIENNAGE_ENTRY_SELECT} FROM gardiennage_entries WHERE id = ? FOR UPDATE`,
      [entryId]
    );
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
      const rows = await tx.all(
        `SELECT ${GARDIENNAGE_ENTRY_SELECT} FROM gardiennage_entries
         WHERE planning_batch_id = ? FOR UPDATE`,
        [batchId]
      );
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
        entryId,
        payload.expectedUpdatedAt
      ]
    );
    if (!result.changes) store.fail("gardiennage:setStatus", "Gardiennage modifié ailleurs.", "GARDIENNAGE_CONFLICT");
    return { existing, batchId: "" };
  });
  const updatedRow = await db.get(
    `SELECT ${GARDIENNAGE_ENTRY_SELECT} FROM gardiennage_entries WHERE id = ?`,
    [entryId]
  );
  const updated = mapGardiennageRow(updatedRow);
  const historyBefore = await store.getEntityChangeHistory("gardiennage_entries", entryId, 3);
  await store.recordEntityChange({
    entityType: "gardiennage_entries",
    entityId: entryId,
    changedBy: actor,
    snapshot: toGardiennageAuditSnapshot(updated)
  });
  if (outcome.batchId) {
    store.logAudit({
      actorUsername: actor,
      action: "GARDIENNAGE_BATCH_CANCEL",
      status: "SUCCESS",
      details: {
        id: entryId,
        batchId: outcome.batchId,
        reason,
        cancelledCount: outcome.cancelledCount,
        preservedClosedCount: outcome.preservedClosedCount,
        historyBefore
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
    actorUsername: actor,
    action: actions[payload.status] || "GARDIENNAGE_STATUS_CHANGE",
    status: "SUCCESS",
    details: {
      id: entryId,
      before: outcome.existing.status,
      after: payload.status,
      ...(payload.status === "ANNULE" ? { cancellationReason: reason } : {}),
      historyBefore
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
  const actor = actorName(payload.requesterUsername);
  const entryId = requireEntryId(store, payload, "gardiennage:close");
  const db = requireGardiennagePersistence(store, "gardiennage:close");
  const now = new Date();
  const nowIso = now.toISOString();
  const existing = await db.transaction(async (tx) => {
    const row = await tx.get(
      `SELECT ${GARDIENNAGE_ENTRY_SELECT} FROM gardiennage_entries WHERE id = ? FOR UPDATE`,
      [entryId]
    );
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
        entryId,
        payload.expectedUpdatedAt
      ]
    );
    if (!result.changes) store.fail("gardiennage:close", "Gardiennage modifié ailleurs.", "GARDIENNAGE_CONFLICT");
    return row;
  });
  const updated = mapGardiennageRow(
    await db.get(`SELECT ${GARDIENNAGE_ENTRY_SELECT} FROM gardiennage_entries WHERE id = ?`, [entryId])
  );
  const historyBefore = await store.getEntityChangeHistory("gardiennage_entries", entryId, 3);
  await store.recordEntityChange({
    entityType: "gardiennage_entries",
    entityId: entryId,
    changedBy: actor,
    snapshot: toGardiennageAuditSnapshot(updated)
  });
  store.logAudit({
    actorUsername: actor,
    action: "GARDIENNAGE_STATUS_CLOTURE",
    status: "SUCCESS",
    details: {
      id: entryId,
      siteDisplay: existing.site_display,
      closeDate: normalizeDateIso(payload.closeDate) || nowIso.slice(0, 10),
      before: { status: existing.status, recurrenceStartDate: existing.recurrence_start_date },
      after: { status: updated.status, recurrenceStartDate: updated.recurrenceStartDate },
      historyBefore
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
  const actor = actorName(payload.requesterUsername);
  const entryId = requireEntryId(store, payload, "gardiennage:reopen");
  const db = requireGardiennagePersistence(store, "gardiennage:reopen");
  const existing = await db.transaction(async (tx) => {
    const row = await tx.get(
      `SELECT ${GARDIENNAGE_ENTRY_SELECT} FROM gardiennage_entries WHERE id = ? FOR UPDATE`,
      [entryId]
    );
    if (!row) store.fail("gardiennage:reopen", "Gardiennage introuvable.", "GARDIENNAGE_NOT_FOUND");
    if (!["CLOTURE", "ANNULE"].includes(row.status)) {
      store.fail("gardiennage:reopen", "Seul un gardiennage annulé ou clôturé peut être rouvert.", "GARDIENNAGE_STATUS_INVALID");
    }
    const result = await tx.run(
      `UPDATE gardiennage_entries
       SET status = 'PLANIFIE', closure_report = '', actual_start_time = '', actual_end_time = '',
           work_order_number = '', cancellation_reason = '', updated_at = ?
       WHERE id = ? AND updated_at = ?`,
      [new Date().toISOString(), entryId, payload.expectedUpdatedAt]
    );
    if (!result.changes) store.fail("gardiennage:reopen", "Gardiennage modifié ailleurs.", "GARDIENNAGE_CONFLICT");
    return row;
  });
  const updated = mapGardiennageRow(
    await db.get(`SELECT ${GARDIENNAGE_ENTRY_SELECT} FROM gardiennage_entries WHERE id = ?`, [entryId])
  );
  const historyBefore = await store.getEntityChangeHistory("gardiennage_entries", entryId, 3);
  await store.recordEntityChange({
    entityType: "gardiennage_entries",
    entityId: entryId,
    changedBy: actor,
    snapshot: toGardiennageAuditSnapshot(updated)
  });
  store.logAudit({
    actorUsername: actor,
    action: "GARDIENNAGE_REOPEN",
    status: "SUCCESS",
    details: {
      id: entryId,
      siteDisplay: existing.site_display,
      before: { status: existing.status, cancellationReason: existing.cancellation_reason || "" },
      after: { status: "PLANIFIE", cancellationReason: "" },
      historyBefore
    }
  });
  return updated;
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
  const actor = actorName(payload.requesterUsername);
  const entryId = requireEntryId(store, payload, "gardiennage:delete");
  const reason = String(payload.reason || "").trim();
  if (!reason) store.fail("gardiennage:delete", "Un motif de suppression est obligatoire.", "DATA_DELETE_REASON_REQUIRED");
  const db = requireGardiennagePersistence(store, "gardiennage:delete");
  const outcome = await db.transaction(async (tx) => {
    const existing = await tx.get(
      `SELECT ${GARDIENNAGE_ENTRY_SELECT} FROM gardiennage_entries WHERE id = ? FOR UPDATE`,
      [entryId]
    );
    if (!existing) store.fail("gardiennage:delete", "Gardiennage introuvable.", "GARDIENNAGE_NOT_FOUND");
    const batchId = String(existing.planning_batch_id || "").trim();
    const scope = batchId
      ? await tx.all(
        `SELECT ${GARDIENNAGE_ENTRY_SELECT} FROM gardiennage_entries
         WHERE planning_batch_id = ? FOR UPDATE`,
        [batchId]
      )
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
      ? await tx.run(
        "DELETE FROM gardiennage_entries WHERE planning_batch_id = ? AND status <> 'CLOTURE'",
        [batchId]
      )
      : await tx.run("DELETE FROM gardiennage_entries WHERE id = ?", [entryId]);
    if (result.changes !== deletable.length) {
      store.fail("gardiennage:delete", "Le gardiennage a été modifié pendant la suppression.", "GARDIENNAGE_CONFLICT");
    }
    return {
      existing,
      batchId: batchId || null,
      deletedCount: result.changes,
      preservedClosedCount: preserved.length
    };
  });
  store.logAudit({
    actorUsername: actor,
    action: outcome.batchId ? "GARDIENNAGE_BATCH_DELETE" : "GARDIENNAGE_DELETE",
    status: "SUCCESS",
    details: {
      id: entryId,
      batchId: outcome.batchId,
      deletedCount: outcome.deletedCount,
      preservedClosedCount: outcome.preservedClosedCount,
      deleted: {
        siteDisplay: outcome.existing.site_display,
        startTime: outcome.existing.start_time,
        endTime: outcome.existing.end_time
      },
      reason
    }
  });
  return {
    success: true,
    batchId: outcome.batchId,
    deletedCount: outcome.deletedCount,
    preservedClosedCount: outcome.preservedClosedCount
  };
}

module.exports = {
  closeGardiennage,
  deleteGardiennage,
  reopenGardiennage,
  setGardiennageStatus
};
