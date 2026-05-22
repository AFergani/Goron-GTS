/**
 * Module Fransor : accompagnements quotidiens, responsables et exceptions de fermeture.
 *
 * Trois référentiels :
 * - `fransor_responsables` — personnes référencées (CRUD Paramètres, soft delete).
 * - `fransor_closures` — périodes / libellés OPEN ou CLOSED (exceptions calendrier).
 * - `fransor_accompagnements` — coches ouverture / fermeture par date et responsable.
 *
 * Les listes mensuelles utilisent le mois `AAAA-MM`. Audit et `entityHistory` sur responsables et closures.
 * Saisie des accompagnements : rôle data reader ; référentiels : reader / manager / delete selon l'action.
 */

const { generateEntityId } = require("../core/ids");

/**
 * Convertit un mois `AAAA-MM` en borne `[from, to)` pour requêtes SQL (`date >= from AND date < to`).
 *
 * @param {string} month
 * @returns {{ from: string, to: string }|null}
 */
function parseMonthRange(month) {
  const clean = String(month || "").trim();
  if (!/^\d{4}-\d{2}$/.test(clean)) return null;
  const from = `${clean}-01`;
  const [year, monthPart] = clean.split("-").map((v) => Number(v));
  const nextMonthDate = new Date(Date.UTC(year, monthPart, 1));
  const to = nextMonthDate.toISOString().slice(0, 10);
  return { from, to };
}

/**
 * @param {import('../userStore')} store
 * @param {{ requesterRole: string }} payload
 */
function listFransorResponsables(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  return store.db
    .prepare(
      `SELECT id, name, created_at, updated_at
       FROM fransor_responsables
       WHERE is_active = 1
       ORDER BY name ASC`
    )
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at || null
    }));
}

/**
 * @param {import('../userStore')} store
 * @returns {{ success: true }}
 */
function createFransorResponsable(store, { requesterRole, requesterUsername, name }) {
  store.ensureDataManagerRole(requesterRole);
  const cleanName = String(name || "").trim();
  if (!cleanName) {
    store.fail("fransor:responsables:create", "Nom responsable obligatoire.", "FRANSOR_RESPONSABLE_REQUIRED");
  }
  const exists = store.db
    .prepare("SELECT id FROM fransor_responsables WHERE lower(name) = lower(?) AND is_active = 1")
    .get(cleanName);
  if (exists) {
    store.fail("fransor:responsables:create", "Ce responsable existe deja.", "FRANSOR_RESPONSABLE_EXISTS");
  }
  const id = generateEntityId();
  const now = new Date().toISOString();
  store.db.prepare("INSERT INTO fransor_responsables (id, name, is_active, created_at) VALUES (?, ?, 1, ?)").run(id, cleanName, now);
  store.recordEntityChange({
    entityType: "fransor_responsables",
    entityId: id,
    changedBy: requesterUsername || "unknown",
    snapshot: { name: cleanName, isActive: true }
  });
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "FRANSOR_RESPONSABLE_CREATE",
    details: { id, name: cleanName }
  });
  return { success: true };
}

/**
 * @param {import('../userStore')} store
 * @returns {{ success: true }}
 */
function updateFransorResponsable(store, { requesterRole, requesterUsername, id, name }) {
  store.ensureDataManagerRole(requesterRole);
  const cleanName = String(name || "").trim();
  if (!id || !cleanName) {
    store.fail("fransor:responsables:update", "Données responsable invalides.", "FRANSOR_RESPONSABLE_REQUIRED");
  }
  const existing = store.db.prepare("SELECT id, name FROM fransor_responsables WHERE id = ? AND is_active = 1").get(id);
  if (!existing) {
    store.fail("fransor:responsables:update", "Responsable introuvable.", "FRANSOR_RESPONSABLE_NOT_FOUND");
  }
  const duplicate = store.db
    .prepare("SELECT id FROM fransor_responsables WHERE lower(name) = lower(?) AND id <> ? AND is_active = 1")
    .get(cleanName, id);
  if (duplicate) {
    store.fail("fransor:responsables:update", "Ce responsable existe deja.", "FRANSOR_RESPONSABLE_EXISTS");
  }
  store.db.prepare("UPDATE fransor_responsables SET name = ?, updated_at = ? WHERE id = ?").run(cleanName, new Date().toISOString(), id);
  const historyBefore = store.getEntityChangeHistory("fransor_responsables", id, 3);
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "FRANSOR_RESPONSABLE_UPDATE",
    details: { id, before: { name: existing.name }, after: { name: cleanName }, historyBefore }
  });
  store.recordEntityChange({
    entityType: "fransor_responsables",
    entityId: id,
    changedBy: requesterUsername || "unknown",
    snapshot: { name: cleanName, isActive: true }
  });
  return { success: true };
}

/**
 * Désactivation logique (`is_active = 0`) avec motif obligatoire.
 *
 * @param {import('../userStore')} store
 * @returns {{ success: true }}
 */
function deleteFransorResponsable(store, { requesterRole, requesterUsername, id, reason }) {
  store.ensureDataDeleteRole(requesterRole);
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) {
    store.fail("fransor:responsables:delete", "Motif de suppression obligatoire.", "DATA_DELETE_REASON_REQUIRED");
  }
  const existing = store.db.prepare("SELECT id, name FROM fransor_responsables WHERE id = ? AND is_active = 1").get(id);
  if (!existing) {
    store.fail("fransor:responsables:delete", "Responsable introuvable.", "FRANSOR_RESPONSABLE_NOT_FOUND");
  }
  store.db.prepare("UPDATE fransor_responsables SET is_active = 0, updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "FRANSOR_RESPONSABLE_DELETE",
    details: { id, deleted: { name: existing.name }, reason: cleanReason }
  });
  return { success: true };
}

/**
 * Exceptions dont la période chevauche le mois demandé.
 *
 * @param {import('../userStore')} store
 * @param {{ requesterRole: string, month: string }} payload
 */
function listFransorClosures(store, { requesterRole, month }) {
  store.ensureDataReaderRole(requesterRole);
  const range = parseMonthRange(month);
  if (!range) {
    store.fail("fransor:closures:list", "Mois invalide.", "FRANSOR_MONTH_INVALID", { month });
  }
  return store.db
    .prepare(
      `SELECT id, start_date, end_date, label, mode, created_at, updated_at
       FROM fransor_closures
       WHERE start_date < ? AND end_date >= ?
       ORDER BY start_date ASC`
    )
    .all(range.to, range.from)
    .map((row) => ({
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
 * @param {import('../userStore')} store
 * @param {object} payload - `mode` : `OPEN` | `CLOSED` (défaut `CLOSED`).
 * @returns {{ success: true }}
 */
function upsertFransorClosure(store, { id, requesterRole, requesterUsername, startDate, endDate, label, mode = "CLOSED" }) {
  store.ensureDataManagerRole(requesterRole);
  const cleanId = String(id || "").trim();
  const cleanStartDate = String(startDate || "").trim();
  const rawEndDate = String(endDate || "").trim();
  const cleanEndDate = rawEndDate || cleanStartDate;
  const cleanLabel = String(label || "").trim();
  const cleanMode = mode === "OPEN" ? "OPEN" : "CLOSED";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanStartDate) || !/^\d{4}-\d{2}-\d{2}$/.test(cleanEndDate) || cleanStartDate > cleanEndDate || !cleanLabel) {
    store.fail("fransor:closures:upsert", "Date de début et libellé obligatoires.", "FRANSOR_CLOSURE_REQUIRED");
  }
  const now = new Date().toISOString();
  if (cleanId) {
    const existingById = store.db
      .prepare("SELECT id, start_date, end_date, label, mode FROM fransor_closures WHERE id = ?")
      .get(cleanId);
    if (!existingById) {
      store.fail("fransor:closures:upsert", "Exception introuvable.", "FRANSOR_CLOSURE_NOT_FOUND");
    }
    store.db
      .prepare(
        `UPDATE fransor_closures
         SET start_date = ?, end_date = ?, label = ?, mode = ?, is_closed = ?, updated_by = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(cleanStartDate, cleanEndDate, cleanLabel, cleanMode, cleanMode === "CLOSED" ? 1 : 0, requesterUsername || "unknown", now, cleanId);
    const historyBefore = store.getEntityChangeHistory("fransor_closures", cleanId, 3);
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
        },
        historyBefore
      }
    });
    store.recordEntityChange({
      entityType: "fransor_closures",
      entityId: cleanId,
      changedBy: requesterUsername || "unknown",
      snapshot: {
        period: { startDate: cleanStartDate, endDate: cleanEndDate },
        label: cleanLabel,
        mode: cleanMode
      }
    });
    return { success: true };
  }
  const existing = store.db
    .prepare("SELECT id, start_date, end_date, label, mode FROM fransor_closures WHERE start_date = ? AND end_date = ? AND label = ?")
    .get(cleanStartDate, cleanEndDate, cleanLabel);
  if (existing) {
    store.db
      .prepare("UPDATE fransor_closures SET mode = ?, is_closed = ?, updated_by = ?, updated_at = ? WHERE id = ?")
      .run(cleanMode, cleanMode === "CLOSED" ? 1 : 0, requesterUsername || "unknown", now, existing.id);
    const historyBefore = store.getEntityChangeHistory("fransor_closures", existing.id, 3);
    store.logAudit({
      actorUsername: requesterUsername || "unknown",
      action: "FRANSOR_CLOSURE_UPDATE",
      details: {
        id: existing.id,
        period: { startDate: cleanStartDate, endDate: cleanEndDate },
        before: { label: existing.label, mode: existing.mode || "CLOSED" },
        after: { label: cleanLabel, mode: cleanMode },
        historyBefore
      }
    });
    store.recordEntityChange({
      entityType: "fransor_closures",
      entityId: existing.id,
      changedBy: requesterUsername || "unknown",
      snapshot: {
        period: { startDate: cleanStartDate, endDate: cleanEndDate },
        label: cleanLabel,
        mode: cleanMode
      }
    });
    return { success: true };
  }
  const newId = generateEntityId();
  store.db
    .prepare(
      `INSERT INTO fransor_closures (id, start_date, end_date, label, mode, is_closed, created_by, created_at, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
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
  store.recordEntityChange({
    entityType: "fransor_closures",
    entityId: newId,
    changedBy: requesterUsername || "unknown",
    snapshot: {
      period: { startDate: cleanStartDate, endDate: cleanEndDate },
      label: cleanLabel,
      mode: cleanMode
    }
  });
  return { success: true };
}

/**
 * Suppression physique de l'exception (motif obligatoire, audit `FRANSOR_CLOSURE_DELETE`).
 *
 * @param {import('../userStore')} store
 * @returns {{ success: true }}
 */
function deleteFransorClosure(store, { requesterRole, requesterUsername, id, reason }) {
  store.ensureDataDeleteRole(requesterRole);
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) {
    store.fail("fransor:closures:delete", "Motif de suppression obligatoire.", "FRANSOR_CLOSURE_DELETE_REASON_REQUIRED");
  }
  const existing = store.db.prepare("SELECT id, start_date, end_date, label, mode FROM fransor_closures WHERE id = ?").get(id);
  if (!existing) {
    store.fail("fransor:closures:delete", "Fermeture introuvable.", "FRANSOR_CLOSURE_NOT_FOUND");
  }
  store.db.prepare("DELETE FROM fransor_closures WHERE id = ?").run(id);
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

/**
 * Accompagnements du mois (une ligne par date + responsable).
 *
 * @param {import('../userStore')} store
 */
function listFransorEntriesByMonth(store, { requesterRole, month }) {
  store.ensureDataReaderRole(requesterRole);
  const range = parseMonthRange(month);
  if (!range) {
    store.fail("fransor:entries:listByMonth", "Mois invalide.", "FRANSOR_MONTH_INVALID", { month });
  }
  return store.db
    .prepare(
      `SELECT id, date, responsable_id, ouverture_done, fermeture_done, created_by, updated_by, created_at, updated_at
       FROM fransor_accompagnements
       WHERE date >= ? AND date < ?
       ORDER BY date ASC`
    )
    .all(range.from, range.to)
    .map((row) => ({
      id: row.id,
      date: row.date,
      responsableId: row.responsable_id,
      ouvertureDone: Boolean(row.ouverture_done),
      fermetureDone: Boolean(row.fermeture_done),
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
}

/**
 * Crée ou met à jour les coches ouverture / fermeture pour une date et un responsable.
 *
 * @param {import('../userStore')} store
 * @returns {{ success: true }}
 */
function upsertFransorEntry(store, { requesterRole, requesterUsername, date, responsableId, ouvertureDone, fermetureDone }) {
  store.ensureDataReaderRole(requesterRole);
  const cleanDate = String(date || "").trim();
  const cleanResponsableId = String(responsableId || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate) || !cleanResponsableId) {
    store.fail("fransor:entries:upsert", "Date et responsable obligatoires.", "FRANSOR_ENTRY_REQUIRED");
  }
  const responsable = store.db.prepare("SELECT id, name FROM fransor_responsables WHERE id = ? AND is_active = 1").get(cleanResponsableId);
  if (!responsable) {
    store.fail("fransor:entries:upsert", "Responsable introuvable.", "FRANSOR_RESPONSABLE_NOT_FOUND");
  }
  const opening = ouvertureDone ? 1 : 0;
  const closing = fermetureDone ? 1 : 0;
  const now = new Date().toISOString();
  const actor = requesterUsername || "unknown";
  const existing = store.db
    .prepare(
      `SELECT id, ouverture_done, fermeture_done
       FROM fransor_accompagnements
       WHERE date = ? AND responsable_id = ?`
    )
    .get(cleanDate, cleanResponsableId);
  if (existing) {
    store.db
      .prepare(
        `UPDATE fransor_accompagnements
         SET ouverture_done = ?, fermeture_done = ?, updated_by = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(opening, closing, actor, now, existing.id);
    store.logAudit({
      actorUsername: actor,
      action: "FRANSOR_ENTRY_UPDATE",
      details: {
        id: existing.id,
        date: cleanDate,
        responsableId: cleanResponsableId,
        responsableName: responsable.name,
        before: { ouvertureDone: Boolean(existing.ouverture_done), fermetureDone: Boolean(existing.fermeture_done) },
        after: { ouvertureDone: Boolean(opening), fermetureDone: Boolean(closing) }
      }
    });
    return { success: true };
  }
  const id = generateEntityId();
  store.db
    .prepare(
      `INSERT INTO fransor_accompagnements
       (id, date, responsable_id, ouverture_done, fermeture_done, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, cleanDate, cleanResponsableId, opening, closing, actor, actor, now, now);
  store.logAudit({
    actorUsername: actor,
    action: "FRANSOR_ENTRY_CREATE",
    details: {
      id,
      date: cleanDate,
      responsableId: cleanResponsableId,
      responsableName: responsable.name,
      ouvertureDone: Boolean(opening),
      fermetureDone: Boolean(closing)
    }
  });
  return { success: true };
}

/**
 * Récapitulatif mensuel par responsable (totaux ouvertures / fermetures, export Word).
 *
 * @param {import('../userStore')} store
 */
function listFransorMonthlyRecap(store, { requesterRole, month }) {
  store.ensureDataReaderRole(requesterRole);
  const range = parseMonthRange(month);
  if (!range) {
    store.fail("fransor:recap:listByMonth", "Mois invalide.", "FRANSOR_MONTH_INVALID", { month });
  }
  return store.db
    .prepare(
      `SELECT r.id AS responsable_id,
              r.name AS responsable_name,
              COALESCE(SUM(a.ouverture_done), 0) AS ouvertures,
              COALESCE(SUM(a.fermeture_done), 0) AS fermetures
       FROM fransor_responsables r
       LEFT JOIN fransor_accompagnements a
         ON a.responsable_id = r.id
        AND a.date >= ?
        AND a.date < ?
       WHERE r.is_active = 1
       GROUP BY r.id, r.name
       ORDER BY r.name ASC`
    )
    .all(range.from, range.to)
    .map((row) => ({
      responsableId: row.responsable_id,
      responsableName: row.responsable_name,
      ouvertures: Number(row.ouvertures) || 0,
      fermetures: Number(row.fermetures) || 0,
      totalActions: (Number(row.ouvertures) || 0) + (Number(row.fermetures) || 0)
    }));
}

module.exports = {
  listFransorResponsables,
  createFransorResponsable,
  updateFransorResponsable,
  deleteFransorResponsable,
  listFransorClosures,
  upsertFransorClosure,
  deleteFransorClosure,
  listFransorEntriesByMonth,
  upsertFransorEntry,
  listFransorMonthlyRecap
};
