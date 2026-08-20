/**
 * Référentiel des responsables Fransor (`fransor_responsables`).
 *
 * CRUD Paramètres (Gestion des données) ; désactivation logique (`is_active = 0`).
 * Accès **PostgreSQL uniquement**. Consommé aussi par la page Fransor (récap / saisies).
 *
 * @module electron/store/domains/fransor/responsables
 */

const { generateEntityId } = require("../../core/ids");
const { actorName } = require("../../core/actorName");
const { sqlFoldExpr } = require("../../core/textFold");
const { requireFransorPersistence } = require("./persistence");

/**
 * @param {object} row - Ligne SQL.
 * @returns {{ id: string, name: string, createdAt: string, updatedAt: string|null }}
 */
function mapRow(row) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at || null
  };
}

/**
 * Responsable actif par id (lecture PostgreSQL).
 *
 * @param {import('../../../userStore')} store
 * @param {string} id
 * @returns {Promise<{ id: string, name: string }|null>}
 */
async function getActiveFransorResponsable(store, id) {
  const cleanId = String(id || "").trim();
  if (!cleanId) return null;
  const db = requireFransorPersistence(store, "fransor:responsables");
  const row = await db.get(
    `SELECT id, name FROM fransor_responsables WHERE id = ? AND is_active = 1`,
    [cleanId]
  );
  if (!row) return null;
  return { id: String(row.id), name: String(row.name || "") };
}

/**
 * Liste les responsables actifs (ordre alphabétique).
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string }} payload
 * @returns {Promise<Array<{ id: string, name: string, createdAt: string, updatedAt: string|null }>>}
 */
async function listFransorResponsables(store, { requesterRole }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requireFransorPersistence(store, "fransor:responsables");
  const rows = await db.all(
    `SELECT id, name, created_at, updated_at
     FROM fransor_responsables
     WHERE is_active = 1
     ORDER BY name ASC`,
    []
  );
  return rows.map(mapRow);
}

/**
 * Crée un responsable Fransor.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<{ success: true }>}
 */
async function createFransorResponsable(store, { requesterRole, requesterUsername, name }) {
  store.ensureDataManagerRole(requesterRole);
  const db = requireFransorPersistence(store, "fransor:responsables:create");
  const cleanName = String(name || "").trim();
  if (!cleanName) {
    store.fail("fransor:responsables:create", "Nom responsable obligatoire.", "FRANSOR_RESPONSABLE_REQUIRED");
  }
  const exists = await db.get(
    `SELECT id FROM fransor_responsables WHERE ${sqlFoldExpr("name")} = ${sqlFoldExpr("?")} AND is_active = 1`,
    [cleanName]
  );
  if (exists) {
    store.fail("fransor:responsables:create", "Ce responsable existe déjà.", "FRANSOR_RESPONSABLE_EXISTS");
  }
  const id = generateEntityId();
  const now = new Date().toISOString();
  const actor = actorName(requesterUsername);
  await db.run("INSERT INTO fransor_responsables (id, name, is_active, created_at) VALUES (?, ?, 1, ?)", [
    id,
    cleanName,
    now
  ]);
  await store.recordEntityChange({
    entityType: "fransor_responsables",
    entityId: id,
    changedBy: actor,
    snapshot: { name: cleanName }
  });
  store.logAudit({
    actorUsername: actor,
    action: "FRANSOR_RESPONSABLE_CREATE",
    details: { id, name: cleanName }
  });
  return { success: true };
}

/**
 * Met à jour un responsable (audit before/after + `historyBefore`).
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<{ success: true }>}
 */
async function updateFransorResponsable(store, { requesterRole, requesterUsername, id, name }) {
  store.ensureDataManagerRole(requesterRole);
  const db = requireFransorPersistence(store, "fransor:responsables:update");
  const cleanId = String(id || "").trim();
  const cleanName = String(name || "").trim();
  if (!cleanId || !cleanName) {
    store.fail("fransor:responsables:update", "Données responsable invalides.", "FRANSOR_RESPONSABLE_REQUIRED");
  }
  const existing = await db.get(
    "SELECT id, name FROM fransor_responsables WHERE id = ? AND is_active = 1",
    [cleanId]
  );
  if (!existing) {
    store.fail("fransor:responsables:update", "Responsable introuvable.", "FRANSOR_RESPONSABLE_NOT_FOUND");
  }
  const duplicate = await db.get(
    `SELECT id FROM fransor_responsables
     WHERE ${sqlFoldExpr("name")} = ${sqlFoldExpr("?")} AND id <> ? AND is_active = 1`,
    [cleanName, cleanId]
  );
  if (duplicate) {
    store.fail("fransor:responsables:update", "Ce responsable existe déjà.", "FRANSOR_RESPONSABLE_EXISTS");
  }
  if (String(existing.name || "") === cleanName) {
    return { success: true };
  }
  const actor = actorName(requesterUsername);
  await db.run("UPDATE fransor_responsables SET name = ?, updated_at = ? WHERE id = ?", [
    cleanName,
    new Date().toISOString(),
    cleanId
  ]);
  const historyBefore = await store.getEntityChangeHistory("fransor_responsables", cleanId, 3);
  store.logAudit({
    actorUsername: actor,
    action: "FRANSOR_RESPONSABLE_UPDATE",
    details: {
      id: cleanId,
      before: { name: String(existing.name || "") },
      after: { name: cleanName },
      historyBefore
    }
  });
  await store.recordEntityChange({
    entityType: "fransor_responsables",
    entityId: cleanId,
    changedBy: actor,
    snapshot: { name: cleanName }
  });
  return { success: true };
}

/**
 * Désactivation logique (`is_active = 0`) avec motif obligatoire.
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<{ success: true }>}
 */
async function deleteFransorResponsable(store, { requesterRole, requesterUsername, id, reason }) {
  store.ensureDataDeleteRole(requesterRole);
  const db = requireFransorPersistence(store, "fransor:responsables:delete");
  const cleanId = String(id || "").trim();
  const cleanReason = String(reason || "").trim();
  if (!cleanId) {
    store.fail("fransor:responsables:delete", "Responsable introuvable.", "FRANSOR_RESPONSABLE_NOT_FOUND");
  }
  if (!cleanReason) {
    store.fail("fransor:responsables:delete", "Motif de suppression obligatoire.", "DATA_DELETE_REASON_REQUIRED");
  }
  const existing = await db.get(
    "SELECT id, name FROM fransor_responsables WHERE id = ? AND is_active = 1",
    [cleanId]
  );
  if (!existing) {
    store.fail("fransor:responsables:delete", "Responsable introuvable.", "FRANSOR_RESPONSABLE_NOT_FOUND");
  }
  await db.run("UPDATE fransor_responsables SET is_active = 0, updated_at = ? WHERE id = ?", [
    new Date().toISOString(),
    cleanId
  ]);
  store.logAudit({
    actorUsername: actorName(requesterUsername),
    action: "FRANSOR_RESPONSABLE_DELETE",
    details: { id: cleanId, deleted: { name: String(existing.name || "") }, reason: cleanReason }
  });
  return { success: true };
}

module.exports = {
  listFransorResponsables,
  createFransorResponsable,
  updateFransorResponsable,
  deleteFransorResponsable,
  getActiveFransorResponsable
};
