/**
 * Exceptions calendrier Fransor (`fransor_closures`) — OPEN / CLOSED.
 *
 * Accès **PostgreSQL uniquement**. Audit before/after + `historyBefore` sur les écritures.
 * `is_closed` reste écrit (colonne schéma, dérivée de `mode`) ; la lecture métier utilise `mode`.
 *
 * @module electron/store/domains/fransor/closures
 */

const { generateEntityId } = require("../../core/ids");
const { actorName } = require("../../core/actorName");
const { normalizeDateIso, parseMonthRange } = require("../../core/isoDate");
const { sqlFoldExpr } = require("../../core/textFold");
const { assertOptimisticLock } = require("../data/optimisticLock");
const { requireFransorPersistence } = require("./persistence");

/**
 * @param {unknown} value
 * @returns {"OPEN"|"CLOSED"}
 */
function normalizeMode(value) {
  return value === "OPEN" ? "OPEN" : "CLOSED";
}

/**
 * @param {"OPEN"|"CLOSED"} mode
 * @returns {0|1}
 */
function closedFlag(mode) {
  return mode === "CLOSED" ? 1 : 0;
}

/**
 * @param {object} row - Ligne SQL.
 * @returns {object}
 */
function mapRow(row) {
  return {
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    label: row.label,
    mode: normalizeMode(row.mode),
    createdAt: row.created_at,
    updatedAt: row.updated_at || null
  };
}

/**
 * @param {{ start_date?: unknown, end_date?: unknown, label?: unknown, mode?: unknown }} row
 * @returns {{ startDate: string, endDate: string, label: string, mode: "OPEN"|"CLOSED" }}
 */
function toClosureSnapshot(row) {
  return {
    startDate: String(row.start_date || ""),
    endDate: String(row.end_date || ""),
    label: String(row.label || ""),
    mode: normalizeMode(row.mode)
  };
}

/**
 * @param {{ startDate: string, endDate: string, label: string, mode: string }} snapshot
 * @returns {{ period: { startDate: string, endDate: string }, label: string, mode: string }}
 */
function toAuditPeriod(snapshot) {
  return {
    period: { startDate: snapshot.startDate, endDate: snapshot.endDate },
    label: snapshot.label,
    mode: snapshot.mode
  };
}

/**
 * Exceptions dont la période chevauche le mois demandé.
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string, month: string }} payload
 * @returns {Promise<object[]>}
 */
async function listFransorClosures(store, { requesterRole, month }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireFransorPersistence(store, "fransor:closures:list");
  const range = parseMonthRange(month);
  if (!range) {
    store.fail("fransor:closures:list", "Mois invalide.", "FRANSOR_MONTH_INVALID", { month });
  }
  const rows = await db.all(
    `SELECT id, start_date, end_date, label, mode, created_at, updated_at
     FROM fransor_closures
     WHERE start_date < ? AND end_date >= ?
     ORDER BY start_date ASC`,
    [range.to, range.from]
  );
  return rows.map(mapRow);
}

/**
 * @param {import('../../persistence/persistenceContract').PersistenceAdapter} db
 * @param {string} startDate
 * @param {string} endDate
 * @param {string} label
 * @param {string} [excludeId]
 * @returns {Promise<object|undefined>}
 */
async function findByPeriodAndLabel(db, startDate, endDate, label, excludeId) {
  if (excludeId) {
    return db.get(
      `SELECT id, start_date, end_date, label, mode
       FROM fransor_closures
       WHERE start_date = ? AND end_date = ? AND ${sqlFoldExpr("label")} = ${sqlFoldExpr("?")} AND id <> ?`,
      [startDate, endDate, label, excludeId]
    );
  }
  return db.get(
    `SELECT id, start_date, end_date, label, mode
     FROM fransor_closures
     WHERE start_date = ? AND end_date = ? AND ${sqlFoldExpr("label")} = ${sqlFoldExpr("?")}`,
    [startDate, endDate, label]
  );
}

/**
 * Crée ou met à jour une exception (par `id`, ou par période + libellé).
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload - `mode` : `OPEN` | `CLOSED` (défaut `CLOSED`).
 * @returns {Promise<{ success: true }>}
 */
async function upsertFransorClosure(
  store,
  { id, requesterRole, requesterUsername, startDate, endDate, label, mode = "CLOSED", expectedUpdatedAt }
) {
  store.ensureDataManagerRole(requesterRole);
  const db = requireFransorPersistence(store, "fransor:closures:upsert");
  const cleanId = String(id || "").trim();
  const cleanStartDate = normalizeDateIso(startDate);
  const cleanEndDate = normalizeDateIso(endDate) || cleanStartDate;
  const cleanLabel = String(label || "").trim();
  const cleanMode = normalizeMode(mode);
  if (!cleanStartDate) {
    store.fail("fransor:closures:upsert", "Date de début invalide.", "FRANSOR_CLOSURE_REQUIRED");
  }
  if (!cleanEndDate) {
    store.fail("fransor:closures:upsert", "Date de fin invalide.", "FRANSOR_CLOSURE_REQUIRED");
  }
  if (cleanStartDate > cleanEndDate) {
    store.fail(
      "fransor:closures:upsert",
      "La date de fin ne peut pas être antérieure à la date de début.",
      "FRANSOR_CLOSURE_REQUIRED"
    );
  }
  if (!cleanLabel) {
    store.fail("fransor:closures:upsert", "Libellé obligatoire.", "FRANSOR_CLOSURE_REQUIRED");
  }
  const after = {
    startDate: cleanStartDate,
    endDate: cleanEndDate,
    label: cleanLabel,
    mode: cleanMode
  };
  const actor = actorName(requesterUsername);
  const now = new Date().toISOString();

  const outcome = await db.transaction(async (tx) => {
    let existing = null;
    if (cleanId) {
      existing = await tx.get(
        "SELECT id, start_date, end_date, label, mode, updated_at FROM fransor_closures WHERE id = ? FOR UPDATE",
        [cleanId]
      );
      if (!existing) {
        store.fail("fransor:closures:upsert", "Exception introuvable.", "FRANSOR_CLOSURE_NOT_FOUND");
      }
      if (expectedUpdatedAt !== undefined) {
        assertOptimisticLock(
          store,
          "fransor:closures:upsert",
          existing,
          expectedUpdatedAt,
          "FRANSOR_CLOSURE_CONFLICT"
        );
      }
      const duplicate = await findByPeriodAndLabel(tx, cleanStartDate, cleanEndDate, cleanLabel, cleanId);
      if (duplicate) {
        store.fail("fransor:closures:upsert", "Cette exception existe déjà.", "FRANSOR_CLOSURE_EXISTS");
      }
    } else {
      existing = await findByPeriodAndLabel(tx, cleanStartDate, cleanEndDate, cleanLabel);
      if (existing) {
        existing = await tx.get(
          "SELECT id, start_date, end_date, label, mode, updated_at FROM fransor_closures WHERE id = ? FOR UPDATE",
          [existing.id]
        );
      }
    }

    if (existing) {
      const before = toClosureSnapshot(existing);
      if (
        before.startDate === after.startDate &&
        before.endDate === after.endDate &&
        before.label === after.label &&
        before.mode === after.mode
      ) {
        return { kind: "noop" };
      }
      const version = expectedUpdatedAt !== undefined ? expectedUpdatedAt ?? null : existing.updated_at;
      const result = await tx.run(
        `UPDATE fransor_closures
         SET start_date = ?, end_date = ?, label = ?, mode = ?, is_closed = ?, updated_by = ?, updated_at = ?
         WHERE id = ? AND updated_at IS NOT DISTINCT FROM ?`,
        [
          cleanStartDate,
          cleanEndDate,
          cleanLabel,
          cleanMode,
          closedFlag(cleanMode),
          actor,
          now,
          existing.id,
          version
        ]
      );
      if (!result.changes) {
        store.fail(
          "fransor:closures:upsert",
          "Cette fiche a été modifiée ailleurs. Actualisez la liste puis réessayez.",
          "FRANSOR_CLOSURE_CONFLICT"
        );
      }
      return { kind: "update", existing };
    }

    const newId = generateEntityId();
    await tx.run(
      `INSERT INTO fransor_closures (id, start_date, end_date, label, mode, is_closed, created_by, created_at, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId, cleanStartDate, cleanEndDate, cleanLabel, cleanMode, closedFlag(cleanMode), actor, now, actor, now]
    );
    return { kind: "create", newId };
  });

  if (outcome.kind === "noop") {
    return { success: true };
  }
  if (outcome.kind === "update") {
    const before = toClosureSnapshot(outcome.existing);
    const historyBefore = await store.getEntityChangeHistory("fransor_closures", outcome.existing.id, 3);
    store.logAudit({
      actorUsername: actor,
      action: "FRANSOR_CLOSURE_UPDATE",
      details: {
        id: outcome.existing.id,
        ...toAuditPeriod(after),
        before,
        after,
        historyBefore
      }
    });
    await store.recordEntityChange({
      entityType: "fransor_closures",
      entityId: outcome.existing.id,
      changedBy: actor,
      snapshot: after
    });
    return { success: true };
  }

  await store.recordEntityChange({
    entityType: "fransor_closures",
    entityId: outcome.newId,
    changedBy: actor,
    snapshot: after
  });
  store.logAudit({
    actorUsername: actor,
    action: "FRANSOR_CLOSURE_CREATE",
    details: { id: outcome.newId, ...toAuditPeriod(after) }
  });
  return { success: true };
}

/**
 * Suppression physique de l'exception (motif obligatoire).
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<{ success: true }>}
 */
async function deleteFransorClosure(store, { requesterRole, requesterUsername, id, reason }) {
  store.ensureDataDeleteRole(requesterRole);
  const db = requireFransorPersistence(store, "fransor:closures:delete");
  const cleanId = String(id || "").trim();
  const cleanReason = String(reason || "").trim();
  if (!cleanId) {
    store.fail("fransor:closures:delete", "Exception introuvable.", "FRANSOR_CLOSURE_NOT_FOUND");
  }
  if (!cleanReason) {
    store.fail(
      "fransor:closures:delete",
      "Motif de suppression obligatoire.",
      "FRANSOR_CLOSURE_DELETE_REASON_REQUIRED"
    );
  }
  const existing = await db.transaction(async (tx) => {
    const row = await tx.get(
      "SELECT id, start_date, end_date, label, mode FROM fransor_closures WHERE id = ? FOR UPDATE",
      [cleanId]
    );
    if (!row) {
      store.fail("fransor:closures:delete", "Exception introuvable.", "FRANSOR_CLOSURE_NOT_FOUND");
    }
    await tx.run("DELETE FROM fransor_closures WHERE id = ?", [cleanId]);
    return row;
  });
  const deleted = toClosureSnapshot(existing);
  store.logAudit({
    actorUsername: actorName(requesterUsername),
    action: "FRANSOR_CLOSURE_DELETE",
    details: {
      id: cleanId,
      ...toAuditPeriod(deleted),
      reason: cleanReason
    }
  });
  return { success: true };
}

module.exports = {
  listFransorClosures,
  upsertFransorClosure,
  deleteFransorClosure
};
