function getDbHealth(store) {
  try {
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS health_check (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        checked_at TEXT NOT NULL
      );
    `);
    store.db
      .prepare("INSERT INTO health_check (checked_at) VALUES (?)")
      .run(new Date().toISOString());
    store.db.exec("DELETE FROM health_check WHERE id IN (SELECT id FROM health_check ORDER BY id DESC LIMIT 1)");
    return { writable: true };
  } catch {
    return { writable: false };
  }
}

module.exports = {
  getDbHealth
};
