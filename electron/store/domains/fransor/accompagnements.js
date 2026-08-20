/**
 * Accompagnements quotidiens Fransor (`fransor_accompagnements`) + récap mensuel.
 *
 * Accès **PostgreSQL uniquement**. Les responsables viennent du module `responsables`.
 * Les fiches déjà saisies restent rattachées à l'id responsable (soft delete côté référentiel).
 *
 * @module electron/store/domains/fransor/accompagnements
 */

const { generateEntityId } = require("../../core/ids");
const { actorName } = require("../../core/actorName");
const { normalizeDateIso, parseMonthRange } = require("../../core/isoDate");
const { requireFransorPersistence } = require("./persistence");
const responsablesDomain = require("./responsables");

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function asBool(value) {
  return Boolean(Number(value));
}

/**
 * @param {object} row - Ligne SQL.
 * @returns {object}
 */
function mapRow(row) {
  return {
    id: row.id,
    date: row.date,
    responsableId: row.responsable_id,
    ouvertureDone: asBool(row.ouverture_done),
    fermetureDone: asBool(row.fermeture_done),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * @param {{ ouverture_done?: unknown, fermeture_done?: unknown }} row
 * @returns {{ ouvertureDone: boolean, fermetureDone: boolean }}
 */
function toEntrySnapshot(row) {
  return {
    ouvertureDone: asBool(row.ouverture_done),
    fermetureDone: asBool(row.fermeture_done)
  };
}

/**
 * Accompagnements du mois (une ligne par date + responsable).
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string, month: string }} payload
 * @returns {Promise<object[]>}
 */
async function listFransorEntriesByMonth(store, { requesterRole, month }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireFransorPersistence(store, "fransor:entries:listByMonth");
  const range = parseMonthRange(month);
  if (!range) {
    store.fail("fransor:entries:listByMonth", "Mois invalide.", "FRANSOR_MONTH_INVALID", { month });
  }
  const rows = await db.all(
    `SELECT id, date, responsable_id, ouverture_done, fermeture_done, created_by, updated_by, created_at, updated_at
     FROM fransor_accompagnements
     WHERE date >= ? AND date < ?
     ORDER BY date ASC`,
    [range.from, range.to]
  );
  return rows.map(mapRow);
}

/**
 * Crée ou met à jour les coches ouverture / fermeture pour une date et un responsable.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<{ success: true }>}
 */
async function upsertFransorEntry(
  store,
  { requesterRole, requesterUsername, date, responsableId, ouvertureDone, fermetureDone }
) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireFransorPersistence(store, "fransor:entries:upsert");
  const cleanDate = normalizeDateIso(date);
  const cleanResponsableId = String(responsableId || "").trim();
  if (!cleanDate) {
    store.fail("fransor:entries:upsert", "Date invalide.", "FRANSOR_ENTRY_REQUIRED");
  }
  if (!cleanResponsableId) {
    store.fail("fransor:entries:upsert", "Responsable obligatoire.", "FRANSOR_ENTRY_REQUIRED");
  }
  const responsable = await responsablesDomain.getActiveFransorResponsable(store, cleanResponsableId);
  if (!responsable) {
    store.fail("fransor:entries:upsert", "Responsable introuvable.", "FRANSOR_RESPONSABLE_NOT_FOUND");
  }
  const opening = ouvertureDone ? 1 : 0;
  const closing = fermetureDone ? 1 : 0;
  const after = { ouvertureDone: Boolean(opening), fermetureDone: Boolean(closing) };
  const now = new Date().toISOString();
  const actor = actorName(requesterUsername);
  const existing = await db.get(
    `SELECT id, ouverture_done, fermeture_done
     FROM fransor_accompagnements
     WHERE date = ? AND responsable_id = ?`,
    [cleanDate, cleanResponsableId]
  );
  if (existing) {
    const before = toEntrySnapshot(existing);
    if (before.ouvertureDone === after.ouvertureDone && before.fermetureDone === after.fermetureDone) {
      return { success: true };
    }
    await db.run(
      `UPDATE fransor_accompagnements
       SET ouverture_done = ?, fermeture_done = ?, updated_by = ?, updated_at = ?
       WHERE id = ?`,
      [opening, closing, actor, now, existing.id]
    );
    const historyBefore = await store.getEntityChangeHistory("fransor_accompagnements", existing.id, 3);
    store.logAudit({
      actorUsername: actor,
      action: "FRANSOR_ENTRY_UPDATE",
      details: {
        id: existing.id,
        date: cleanDate,
        responsableName: responsable.name,
        before,
        after,
        historyBefore
      }
    });
    await store.recordEntityChange({
      entityType: "fransor_accompagnements",
      entityId: existing.id,
      changedBy: actor,
      snapshot: after
    });
    return { success: true };
  }
  const id = generateEntityId();
  await db.run(
    `INSERT INTO fransor_accompagnements
     (id, date, responsable_id, ouverture_done, fermeture_done, created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, cleanDate, cleanResponsableId, opening, closing, actor, actor, now, now]
  );
  await store.recordEntityChange({
    entityType: "fransor_accompagnements",
    entityId: id,
    changedBy: actor,
    snapshot: after
  });
  store.logAudit({
    actorUsername: actor,
    action: "FRANSOR_ENTRY_CREATE",
    details: {
      id,
      date: cleanDate,
      responsableName: responsable.name,
      ...after
    }
  });
  return { success: true };
}

/**
 * Récapitulatif mensuel par responsable actif (totaux ouvertures / fermetures).
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string, month: string }} payload
 * @returns {Promise<object[]>}
 */
async function listFransorMonthlyRecap(store, { requesterRole, month }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireFransorPersistence(store, "fransor:recap:listByMonth");
  const range = parseMonthRange(month);
  if (!range) {
    store.fail("fransor:recap:listByMonth", "Mois invalide.", "FRANSOR_MONTH_INVALID", { month });
  }
  const responsables = await responsablesDomain.listFransorResponsables(store, { requesterRole });
  const aggregates = await db.all(
    `SELECT responsable_id,
            COALESCE(SUM(ouverture_done), 0) AS ouvertures,
            COALESCE(SUM(fermeture_done), 0) AS fermetures
     FROM fransor_accompagnements
     WHERE date >= ? AND date < ?
     GROUP BY responsable_id`,
    [range.from, range.to]
  );
  const byId = new Map(
    aggregates.map((row) => [
      String(row.responsable_id),
      {
        ouvertures: Number(row.ouvertures) || 0,
        fermetures: Number(row.fermetures) || 0
      }
    ])
  );
  return responsables.map((resp) => {
    const agg = byId.get(String(resp.id)) || { ouvertures: 0, fermetures: 0 };
    return {
      responsableId: resp.id,
      responsableName: resp.name,
      ouvertures: agg.ouvertures,
      fermetures: agg.fermetures,
      totalActions: agg.ouvertures + agg.fermetures
    };
  });
}

module.exports = {
  listFransorEntriesByMonth,
  upsertFransorEntry,
  listFransorMonthlyRecap
};
