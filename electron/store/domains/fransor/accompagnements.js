/**
 * Accompagnements quotidiens Fransor (`fransor_accompagnements`) + récap mensuel.
 *
 * Accès **PostgreSQL uniquement**. Les responsables viennent du module `responsables`.
 *
 * @module electron/store/domains/fransor/accompagnements
 */

const { generateEntityId } = require("../../core/ids");
const { parseMonthRange } = require("./monthRange");
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
  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    responsableId: row.responsable_id,
    ouvertureDone: asBool(row.ouverture_done),
    fermetureDone: asBool(row.fermeture_done),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
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
  const cleanDate = String(date || "").trim();
  const cleanResponsableId = String(responsableId || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate) || !cleanResponsableId) {
    store.fail("fransor:entries:upsert", "Date et responsable obligatoires.", "FRANSOR_ENTRY_REQUIRED");
  }
  const responsable = await responsablesDomain.getActiveFransorResponsable(store, cleanResponsableId);
  if (!responsable) {
    store.fail("fransor:entries:upsert", "Responsable introuvable.", "FRANSOR_RESPONSABLE_NOT_FOUND");
  }
  const opening = ouvertureDone ? 1 : 0;
  const closing = fermetureDone ? 1 : 0;
  const now = new Date().toISOString();
  const actor = requesterUsername || "unknown";
  const existing = await db.get(
    `SELECT id, ouverture_done, fermeture_done
     FROM fransor_accompagnements
     WHERE date = ? AND responsable_id = ?`,
    [cleanDate, cleanResponsableId]
  );
  if (existing) {
    await db.run(
      `UPDATE fransor_accompagnements
       SET ouverture_done = ?, fermeture_done = ?, updated_by = ?, updated_at = ?
       WHERE id = ?`,
      [opening, closing, actor, now, existing.id]
    );
    store.logAudit({
      actorUsername: actor,
      action: "FRANSOR_ENTRY_UPDATE",
      details: {
        id: existing.id,
        date: cleanDate,
        responsableId: cleanResponsableId,
        responsableName: responsable.name,
        before: {
          ouvertureDone: asBool(existing.ouverture_done),
          fermetureDone: asBool(existing.fermeture_done)
        },
        after: { ouvertureDone: Boolean(opening), fermetureDone: Boolean(closing) }
      }
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
 * Récapitulatif mensuel par responsable (totaux ouvertures / fermetures).
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
