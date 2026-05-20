const authUsersDomain = require("./authUsers");

function listAuditLogs(store, { requesterUsername, limit = 200, role }) {
  authUsersDomain.ensureStationAdminAccess(store, requesterUsername, role, "audit:list");

  const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 1000));
  const rows = store.db
    .prepare(
      `SELECT occurred_at, actor_username, action, target_username, status, details_json
       FROM audit_logs
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(safeLimit);
  const userRows = store.db.prepare("SELECT username, full_name FROM users").all();
  const displayNameByUsername = new Map(
    userRows.map((userRow) => [String(userRow.username || ""), String(userRow.full_name || "").trim()])
  );
  const toDisplayName = (value) => {
    const username = String(value || "").trim();
    if (!username) return null;
    const displayName = displayNameByUsername.get(username);
    return displayName || username;
  };

  return rows.map((row) => ({
    occurredAt: row.occurred_at,
    actorUsername: toDisplayName(row.actor_username) || "system",
    action: row.action,
    targetUsername: toDisplayName(row.target_username),
    status: row.status,
    details: row.details_json ? JSON.parse(row.details_json) : null
  }));
}

function getAuditMetadata(store, { requesterUsername, role }) {
  authUsersDomain.ensureStationAdminAccess(store, requesterUsername, role, "audit:metadata");

  const row = store.db
    .prepare(
      `SELECT MIN(occurred_at) AS first_occurred_at, MAX(occurred_at) AS last_occurred_at, COUNT(*) AS total
       FROM audit_logs`
    )
    .get();
  return {
    firstOccurredAt: row?.first_occurred_at || null,
    lastOccurredAt: row?.last_occurred_at || null,
    total: Number(row?.total || 0)
  };
}

module.exports = {
  listAuditLogs,
  getAuditMetadata
};
