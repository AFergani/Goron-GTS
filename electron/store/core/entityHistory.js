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
