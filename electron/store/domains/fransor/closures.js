/**
 * Exceptions calendrier Fransor (`fransor_closures`) — OPEN / CLOSED.
 *
 * Accès **PostgreSQL uniquement**. Audit before/after sur les écritures.
 *
 * @module electron/store/domains/fransor/closures
 */

const { generateEntityId } = require("../../core/ids");
const { parseMonthRange } = require("./monthRange");
const { requireFransorPersistence } = require("./persistence");

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
  return rows.map((row) => ({
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    label: row.label,
    mode: row.mode === "OPEN" ? "OPEN" : "CLOSED",
    createdAt: row.created_at,
    updatedAt: row.updated_at || null
  }));
}

/**
 * Crée ou met à jour une exception (par `id`, ou par triplet période + libellé existant).
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload - `mode` : `OPEN` | `CLOSED` (défaut `CLOSED`).
 * @returns {Promise<{ success: true }>}
 */
async function upsertFransorClosure(
  store,
  { id, requesterRole, requesterUsername, startDate, endDate, label, mode = "CLOSED" }
) {
  store.ensureDataManagerRole(requesterRole);
  const db = requireFransorPersistence(store, "fransor:closures:upsert");
  const cleanId = String(id || "").trim();
  const cleanStartDate = String(startDate || "").trim();
  const rawEndDate = String(endDate || "").trim();
  const cleanEndDate = rawEndDate || cleanStartDate;
  const cleanLabel = String(label || "").trim();
  const cleanMode = mode === "OPEN" ? "OPEN" : "CLOSED";
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(cleanStartDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(cleanEndDate) ||
    cleanStartDate > cleanEndDate ||
    !cleanLabel
  ) {
    store.fail("fransor:closures:upsert", "Date de début et libellé obligatoires.", "FRANSOR_CLOSURE_REQUIRED");
  }
  const now = new Date().toISOString();
  if (cleanId) {
    const existingById = await db.get(
      "SELECT id, start_date, end_date, label, mode FROM fransor_closures WHERE id = ?",
      [cleanId]
    );
    if (!existingById) {
      store.fail("fransor:closures:upsert", "Exception introuvable.", "FRANSOR_CLOSURE_NOT_FOUND");
    }
    await db.run(
      `UPDATE fransor_closures
       SET start_date = ?, end_date = ?, label = ?, mode = ?, is_closed = ?, updated_by = ?, updated_at = ?
       WHERE id = ?`,
      [
        cleanStartDate,
        cleanEndDate,
        cleanLabel,
        cleanMode,
        cleanMode === "CLOSED" ? 1 : 0,
        requesterUsername || "unknown",
        now,
        cleanId
      ]
    );
    store.logAudit({
      actorUsername: requesterUsername || "unknown",
      action: "FRANSOR_CLOSURE_UPDATE",
      details: {
        id: cleanId,
        before: {
          period: { startDate: existingById.start_date, endDate: existingById.end_date },
          label: existingById.label,
          mode: existingById.mode || "CLOSED"
        },
        after: {
          period: { startDate: cleanStartDate, endDate: cleanEndDate },
          label: cleanLabel,
          mode: cleanMode
        }
      }
    });
    return { success: true };
  }
  const existing = await db.get(
    "SELECT id, start_date, end_date, label, mode FROM fransor_closures WHERE start_date = ? AND end_date = ? AND label = ?",
    [cleanStartDate, cleanEndDate, cleanLabel]
  );
  if (existing) {
    await db.run(
      "UPDATE fransor_closures SET mode = ?, is_closed = ?, updated_by = ?, updated_at = ? WHERE id = ?",
      [cleanMode, cleanMode === "CLOSED" ? 1 : 0, requesterUsername || "unknown", now, existing.id]
    );
    store.logAudit({
      actorUsername: requesterUsername || "unknown",
      action: "FRANSOR_CLOSURE_UPDATE",
      details: {
        id: existing.id,
        period: { startDate: cleanStartDate, endDate: cleanEndDate },
        before: { label: existing.label, mode: existing.mode || "CLOSED" },
        after: { label: cleanLabel, mode: cleanMode }
      }
    });
    return { success: true };
  }
  const newId = generateEntityId();
  await db.run(
    `INSERT INTO fransor_closures (id, start_date, end_date, label, mode, is_closed, created_by, created_at, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId,
      cleanStartDate,
      cleanEndDate,
      cleanLabel,
      cleanMode,
      cleanMode === "CLOSED" ? 1 : 0,
      requesterUsername || "unknown",
      now,
      requesterUsername || "unknown",
      now
    ]
  );
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "FRANSOR_CLOSURE_CREATE",
    details: {
      id: newId,
      period: { startDate: cleanStartDate, endDate: cleanEndDate },
      label: cleanLabel,
      mode: cleanMode
    }
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
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) {
    store.fail(
      "fransor:closures:delete",
      "Motif de suppression obligatoire.",
      "FRANSOR_CLOSURE_DELETE_REASON_REQUIRED"
    );
  }
  const existing = await db.get(
    "SELECT id, start_date, end_date, label, mode FROM fransor_closures WHERE id = ?",
    [id]
  );
  if (!existing) {
    store.fail("fransor:closures:delete", "Fermeture introuvable.", "FRANSOR_CLOSURE_NOT_FOUND");
  }
  await db.run("DELETE FROM fransor_closures WHERE id = ?", [id]);
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "FRANSOR_CLOSURE_DELETE",
    details: {
      id,
      period: { startDate: existing.start_date, endDate: existing.end_date },
      label: existing.label,
      mode: existing.mode || "CLOSED",
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
