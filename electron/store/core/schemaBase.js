function ensureBaseSchema(store) {
  store.db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL,
      manager_profile TEXT,
      theme_mode TEXT,
      page_access_json TEXT,
      password_hash TEXT NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 1,
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      is_locked INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_by TEXT,
      updated_at TEXT
    );
  `);

  store.db.exec(`
    CREATE TABLE IF NOT EXISTS error_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occurred_at TEXT NOT NULL,
      source TEXT NOT NULL,
      code TEXT NOT NULL,
      message_fr TEXT NOT NULL,
      details_json TEXT
    );
  `);

  store.db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occurred_at TEXT NOT NULL,
      actor_username TEXT NOT NULL,
      action TEXT NOT NULL,
      target_username TEXT,
      status TEXT NOT NULL,
      details_json TEXT
    );
  `);
  store.db.exec(`
    CREATE TABLE IF NOT EXISTS entity_change_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      changed_at TEXT NOT NULL,
      changed_by TEXT NOT NULL,
      snapshot_json TEXT NOT NULL
    );
  `);
  store.db.exec(
    `CREATE INDEX IF NOT EXISTS idx_entity_change_history_lookup
     ON entity_change_history(entity_type, entity_id, datetime(changed_at) DESC);`
  );

  store.db.exec(`
    CREATE TABLE IF NOT EXISTS data_sites (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      address TEXT,
      famille TEXT,
      parc TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
  `);

  store.db.exec(`
    CREATE TABLE IF NOT EXISTS data_intervenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
  `);

  store.db.exec(`
    CREATE TABLE IF NOT EXISTS data_anomaly_types (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL UNIQUE,
      color_hex TEXT NOT NULL DEFAULT '#1f5fcf',
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
  `);

  store.db.exec(`
    CREATE TABLE IF NOT EXISTS main_courante_entries (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      operator_name TEXT NOT NULL,
      site_id TEXT,
      site_display TEXT NOT NULL DEFAULT '',
      anomaly_type_id TEXT NOT NULL,
      anomaly_type_label TEXT NOT NULL,
      information TEXT NOT NULL,
      status TEXT NOT NULL,
      manager_observation TEXT,
      manager_name TEXT,
      consulted_by_manager_at TEXT,
      consulted_by_manager_name TEXT,
      prise_en_compte_at TEXT,
      closed_at TEXT,
      archived_at TEXT,
      archived_by TEXT,
      archive_reason TEXT,
      updated_at TEXT NOT NULL
    );
  `);
  store.db.exec(
    `CREATE INDEX IF NOT EXISTS idx_main_courante_created ON main_courante_entries(created_at DESC);`
  );

  store.db.exec(`
    CREATE TABLE IF NOT EXISTS fransor_responsables (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
  `);
  store.db.exec(`
    CREATE TABLE IF NOT EXISTS fransor_closures (
      id TEXT PRIMARY KEY,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      label TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'CLOSED',
      is_closed INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_by TEXT,
      updated_at TEXT
    );
  `);
  store.db.exec("CREATE INDEX IF NOT EXISTS idx_fransor_closures_period ON fransor_closures(start_date, end_date)");
  store.db.exec(`
    CREATE TABLE IF NOT EXISTS fransor_accompagnements (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      responsable_id TEXT NOT NULL,
      ouverture_done INTEGER NOT NULL DEFAULT 0,
      fermeture_done INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (responsable_id) REFERENCES fransor_responsables(id)
    );
  `);
  store.db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_fransor_entry_unique ON fransor_accompagnements(date, responsable_id);`
  );
  store.db.exec(
    `CREATE INDEX IF NOT EXISTS idx_fransor_entry_date ON fransor_accompagnements(date DESC);`
  );

  store.db.exec(`
    CREATE TABLE IF NOT EXISTS intervention_entries (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      site_id TEXT,
      site_display TEXT NOT NULL,
      request_reason TEXT NOT NULL,
      request_date TEXT NOT NULL,
      request_time TEXT NOT NULL,
      arrival_date TEXT,
      arrival_time TEXT,
      departure_time TEXT,
      departure_date TEXT,
      delay_minutes INTEGER,
      work_order_number TEXT,
      report TEXT,
      intervenant_id TEXT,
      intervenant_name TEXT NOT NULL,
      status TEXT NOT NULL,
      billing_status TEXT NOT NULL DEFAULT 'FACTURABLE',
      billing_reason TEXT,
      export_extra_json TEXT DEFAULT '{}',
      cancellation_reason TEXT,
      closed_at TEXT,
      archived_at TEXT
    );
  `);
  store.db.exec(
    `CREATE INDEX IF NOT EXISTS idx_intervention_request_dt ON intervention_entries(request_date DESC, request_time DESC);`
  );
  const interventionCols = store.db.prepare("PRAGMA table_info(intervention_entries)").all();
  const interventionColNames = new Set(interventionCols.map((c) => String(c.name || "")));
  if (!interventionColNames.has("arrival_date")) {
    store.db.exec("ALTER TABLE intervention_entries ADD COLUMN arrival_date TEXT");
  }
  store.db.exec(`
    CREATE TABLE IF NOT EXISTS intervention_site_pending (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  store.db.exec(`
    CREATE TABLE IF NOT EXISTS intervention_intervenant_pending (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

module.exports = {
  ensureBaseSchema
};
