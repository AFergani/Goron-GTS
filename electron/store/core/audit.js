function writeAudit(db, { actorUsername, action, targetUsername = null, status = "SUCCESS", details = null }) {
  db.prepare(
    `INSERT INTO audit_logs (occurred_at, actor_username, action, target_username, status, details_json)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    new Date().toISOString(),
    actorUsername || "system",
    action,
    targetUsername,
    status,
    details ? JSON.stringify(details) : null
  );
}

module.exports = { writeAudit };
