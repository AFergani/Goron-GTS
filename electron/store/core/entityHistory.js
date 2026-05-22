/**
 * Historique des dernières modifications sur les entités de gestion de données (référentiels, Fransor, etc.).
 * Alimente la table `entity_change_history` pour enrichir les logs d'audit (`historyBefore` sur UPDATE/DELETE).
 *
 * Exposé via `UserStore.getEntityChangeHistory` / `UserStore.recordEntityChange` ;
 * utilisé par `referentials`, `fransor`, `holidays`, `rondeMotifTypes`, `rondePlannedProfiles`.
 */

/**
 * Retourne les N derniers snapshots enregistrés pour une entité.
 *
 * @param {import('../userStore')} store - Instance store (accès `store.db`).
 * @param {string} entityType - Clé métier (ex. `data_sites`, `fransor_closures`).
 * @param {string} entityId - Identifiant de l'enregistrement.
 * @param {number} [limit=3] - Nombre de versions (borné entre 1 et 20).
 * @returns {Array<{ changedAt: string, changedBy: string, snapshot: object|null }>}
 */
function getEntityChangeHistory(store, entityType, entityId, limit = 3) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 3, 20));
  const rows = store.db
    .prepare(
      `SELECT changed_at, changed_by, snapshot_json
       FROM entity_change_history
       WHERE entity_type = ? AND entity_id = ?
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(String(entityType || ""), String(entityId || ""), safeLimit);
  return rows.map((row) => {
    let snapshot = null;
    try {
      snapshot = row.snapshot_json ? JSON.parse(row.snapshot_json) : null;
    } catch {
      snapshot = null;
    }
    return {
      changedAt: row.changed_at,
      changedBy: row.changed_by,
      snapshot
    };
  });
}

/**
 * Enregistre un snapshot après création ou modification d'une entité référentielle.
 *
 * @param {import('../userStore')} store
 * @param {object} params
 * @param {string} params.entityType - Type d'entité (aligné avec les lectures `getEntityChangeHistory`).
 * @param {string} params.entityId - Identifiant stable de la ligne.
 * @param {string} params.changedBy - `requesterUsername` ou acteur système.
 * @param {object} params.snapshot - Champs métier utiles à l'audit (sérialisés en JSON).
 * @returns {void}
 */
function recordEntityChange(store, { entityType, entityId, changedBy, snapshot }) {
  store.db
    .prepare(
      `INSERT INTO entity_change_history (entity_type, entity_id, changed_at, changed_by, snapshot_json)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      String(entityType || ""),
      String(entityId || ""),
      new Date().toISOString(),
      String(changedBy || "unknown"),
      JSON.stringify(snapshot || {})
    );
}

module.exports = {
  getEntityChangeHistory,
  recordEntityChange
};
