/**
 * Référentiel des responsables Fransor (`fransor_responsables`).
 *
 * CRUD Paramètres (Gestion des données) ; soft delete (`is_active = 0`).
 * Accès **PostgreSQL uniquement**. Consommé aussi par la page Fransor (récap / saisies).
 *
 * @module electron/store/domains/fransor/responsables
 */

const { generateEntityId } = require("../../core/ids");
const { requireFransorPersistence } = require("./persistence");

/**
 * Recharge le cache id → { id, name } des responsables actifs.
 *
 * @param {import('../../../userStore')} store
 * @returns {Promise<Map<string, { id: string, name: string }>>}
 */
async function refreshFransorResponsablesCache(store) {
  const db =
    typeof store.getReferentialsPersistence === "function" ? store.getReferentialsPersistence() : null;
  if (!db || !db.isOpen()) {
    return store._fransorResponsablesByIdCache instanceof Map
      ? store._fransorResponsablesByIdCache
      : new Map();
  }
  const rows = await db.all(
    `SELECT id, name FROM fransor_responsables WHERE is_active = 1 ORDER BY name ASC`,
    []
  );
  const map = new Map(
    rows.map((row) => [
      String(row.id),
      { id: String(row.id), name: String(row.name || "") }
    ])
  );
  store._fransorResponsablesByIdCache = map;
  return map;
}

/**
 * Responsable actif par id (cache PG, sinon lecture PG directe).
 *
 * @param {import('../../../userStore')} store
 * @param {string} id
 * @returns {Promise<{ id: string, name: string }|null>}
 */
async function getActiveFransorResponsable(store, id) {
  const cleanId = String(id || "").trim();
  if (!cleanId) return null;
  if (store._fransorResponsablesByIdCache instanceof Map) {
    const cached = store._fransorResponsablesByIdCache.get(cleanId);
    if (cached) return cached;
  }
  const db =
    typeof store.getReferentialsPersistence === "function" ? store.getReferentialsPersistence() : null;
  if (!db || !db.isOpen()) return null;
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
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at || null
  }));
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
    "SELECT id FROM fransor_responsables WHERE lower(name) = lower(?) AND is_active = 1",
    [cleanName]
  );
  if (exists) {
    store.fail("fransor:responsables:create", "Ce responsable existe deja.", "FRANSOR_RESPONSABLE_EXISTS");
  }
  const id = generateEntityId();
  const now = new Date().toISOString();
  await db.run("INSERT INTO fransor_responsables (id, name, is_active, created_at) VALUES (?, ?, 1, ?)", [
    id,
    cleanName,
    now
  ]);
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "FRANSOR_RESPONSABLE_CREATE",
    details: { id, name: cleanName }
  });
  await refreshFransorResponsablesCache(store);
  return { success: true };
}

/**
 * Met à jour un responsable (audit before/after).
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @returns {Promise<{ success: true }>}
 */
async function updateFransorResponsable(store, { requesterRole, requesterUsername, id, name }) {
  store.ensureDataManagerRole(requesterRole);
  const db = requireFransorPersistence(store, "fransor:responsables:update");
  const cleanName = String(name || "").trim();
  if (!id || !cleanName) {
    store.fail("fransor:responsables:update", "Données responsable invalides.", "FRANSOR_RESPONSABLE_REQUIRED");
  }
  const existing = await db.get("SELECT id, name FROM fransor_responsables WHERE id = ? AND is_active = 1", [id]);
  if (!existing) {
    store.fail("fransor:responsables:update", "Responsable introuvable.", "FRANSOR_RESPONSABLE_NOT_FOUND");
  }
  const duplicate = await db.get(
    "SELECT id FROM fransor_responsables WHERE lower(name) = lower(?) AND id <> ? AND is_active = 1",
    [cleanName, id]
  );
  if (duplicate) {
    store.fail("fransor:responsables:update", "Ce responsable existe deja.", "FRANSOR_RESPONSABLE_EXISTS");
  }
  await db.run("UPDATE fransor_responsables SET name = ?, updated_at = ? WHERE id = ?", [
    cleanName,
    new Date().toISOString(),
    id
  ]);
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "FRANSOR_RESPONSABLE_UPDATE",
    details: { id, before: { name: existing.name }, after: { name: cleanName } }
  });
  await refreshFransorResponsablesCache(store);
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
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) {
    store.fail("fransor:responsables:delete", "Motif de suppression obligatoire.", "DATA_DELETE_REASON_REQUIRED");
  }
  const existing = await db.get("SELECT id, name FROM fransor_responsables WHERE id = ? AND is_active = 1", [id]);
  if (!existing) {
    store.fail("fransor:responsables:delete", "Responsable introuvable.", "FRANSOR_RESPONSABLE_NOT_FOUND");
  }
  await db.run("UPDATE fransor_responsables SET is_active = 0, updated_at = ? WHERE id = ?", [
    new Date().toISOString(),
    id
  ]);
  store.logAudit({
    actorUsername: requesterUsername || "unknown",
    action: "FRANSOR_RESPONSABLE_DELETE",
    details: { id, deleted: { name: existing.name }, reason: cleanReason }
  });
  await refreshFransorResponsablesCache(store);
  return { success: true };
}

module.exports = {
  listFransorResponsables,
  createFransorResponsable,
  updateFransorResponsable,
  deleteFransorResponsable,
  refreshFransorResponsablesCache,
  getActiveFransorResponsable
};
