/**
 * Historique des modifications d'entités référentielles (snapshots pour audit UPDATE).
 *
 * Conserve les derniers états connus par entité (`entity_type` + `entity_id`) afin de
 * enrichir les journaux d'audit avec `historyBefore` (3 changements précédents).
 * Utilisé par les domaines `data/referentials`, `data/holidays`, `data/rondeMotifTypes`.
 *
 * @module electron/store/core/entityHistory
 */

/**
 * Enregistre un snapshot après création ou modification d'une entité référentielle.
 *
 * @param {import('../persistence/persistenceContract').PersistenceAdapter|null} persistence
 * @param {{ entityType: string, entityId: string, changedBy?: string, snapshot?: object }} entry
 * @returns {Promise<void>}
 */
async function recordEntityChange(persistence, { entityType, entityId, changedBy, snapshot }) {
  if (!persistence || typeof persistence.run !== "function") return;
  const type = String(entityType || "").trim();
  const id = String(entityId || "").trim();
  if (!type || !id) return;
  await persistence.run(
    `INSERT INTO entity_change_history (entity_type, entity_id, changed_at, changed_by, snapshot_json)
     VALUES (?, ?, ?, ?, ?)`,
    [type, id, new Date().toISOString(), String(changedBy || "unknown"), JSON.stringify(snapshot || {})]
  );
}

/**
 * Retourne les N derniers snapshots enregistrés pour une entité (ordre antéchronologique).
 *
 * @param {import('../persistence/persistenceContract').PersistenceAdapter|null} persistence
 * @param {string} entityType
 * @param {string} entityId
 * @param {number} [limit=3]
 * @returns {Promise<Array<{ changedAt: string, changedBy: string, snapshot: object }>>}
 */
async function getEntityChangeHistory(persistence, entityType, entityId, limit = 3) {
  if (!persistence || typeof persistence.all !== "function") return [];
  const type = String(entityType || "").trim();
  const id = String(entityId || "").trim();
  if (!type || !id) return [];
  const safeLimit = Math.max(1, Math.min(Number(limit) || 3, 10));
  const rows = await persistence.all(
    `SELECT changed_at, changed_by, snapshot_json
     FROM entity_change_history
     WHERE entity_type = ? AND entity_id = ?
     ORDER BY changed_at DESC
     LIMIT ?`,
    [type, id, safeLimit]
  );
  return rows.map((row) => {
    let snapshot = {};
    try {
      const parsed = JSON.parse(String(row.snapshot_json || "{}"));
      snapshot = parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      snapshot = {};
    }
    return {
      changedAt: String(row.changed_at || ""),
      changedBy: String(row.changed_by || ""),
      snapshot
    };
  });
}

module.exports = { getEntityChangeHistory, recordEntityChange };
