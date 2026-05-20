function writeErrorLog(store, { source, code, messageFr, details }) {
  store.db
    .prepare(
      `INSERT INTO error_logs (occurred_at, source, code, message_fr, details_json)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      new Date().toISOString(),
      source,
      code,
      messageFr,
      details ? JSON.stringify(details) : null
    );
}

module.exports = {
  writeErrorLog
};
