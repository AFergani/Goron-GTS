const { generateEntityId } = require("./ids");

function ensureRondeSchema(store) {
  store.db.exec(`
    CREATE TABLE IF NOT EXISTS ronde_entries (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'URGENCE',
      origin_intervention_id TEXT,
      site_id TEXT,
      site_display TEXT NOT NULL,
      request_date TEXT NOT NULL,
      motif_category TEXT NOT NULL,
      motif_other TEXT,
      horaires_demande_obs TEXT,
      origin_kind TEXT NOT NULL,
      origin_detail TEXT,
      intervenant_id TEXT,
      intervenant_name TEXT NOT NULL,
      arrival_time TEXT,
      departure_time TEXT,
      duration_minutes INTEGER,
      work_order_number TEXT,
      report TEXT,
      motif_type_id TEXT,
      planned_profile_id TEXT,
      planned_round_kind TEXT,
      planned_slot_key TEXT,
      request_batch_id TEXT,
      request_planning_snapshot_json TEXT,
      closure_custom_values_json TEXT,
      status TEXT NOT NULL,
      cancellation_reason TEXT,
      closed_at TEXT
    );
  `);
  store.db.exec(`CREATE INDEX IF NOT EXISTS idx_ronde_request_date ON ronde_entries(request_date DESC);`);
  store.db.exec(`CREATE INDEX IF NOT EXISTS idx_ronde_status ON ronde_entries(status);`);
  store.db.exec(`
    CREATE TABLE IF NOT EXISTS data_ronde_motif_types (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      requires_free_text INTEGER NOT NULL DEFAULT 0,
      color_hex TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      legacy_code TEXT UNIQUE,
      created_at TEXT NOT NULL
    );
  `);
  store.db.exec(`CREATE INDEX IF NOT EXISTS idx_ronde_motif_sort ON data_ronde_motif_types(sort_order, label);`);
  store.db.exec(`
    CREATE TABLE IF NOT EXISTS data_ronde_planned_profiles (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      site_id TEXT,
      intervenant_id TEXT,
      notes TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      closure_form_enabled INTEGER NOT NULL DEFAULT 0,
      create_rounds_enabled INTEGER NOT NULL DEFAULT 1,
      closure_fields_json TEXT,
      planning_valid_from TEXT,
      planning_valid_to TEXT,
      validated_at TEXT,
      validated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  store.db.exec(`
    CREATE TABLE IF NOT EXISTS data_ronde_planned_profile_lines (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      round_kind TEXT NOT NULL,
      recurrence_kind TEXT NOT NULL,
      weekdays_mask INTEGER NOT NULL DEFAULT 0,
      month_day INTEGER,
      requested_time TEXT,
      interval_minutes INTEGER,
      motif_type_id TEXT,
      random_period_mask INTEGER NOT NULL DEFAULT 3,
      range_start_date TEXT,
      range_end_date TEXT,
      random_window_start TEXT,
      random_window_end TEXT,
      random_rounds_count INTEGER,
      include_holidays INTEGER NOT NULL DEFAULT 0,
      include_holiday_eves INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  store.db.exec(
    `CREATE INDEX IF NOT EXISTS idx_ronde_planned_profiles_active ON data_ronde_planned_profiles(is_active, label);`
  );
  store.db.exec(
    `CREATE INDEX IF NOT EXISTS idx_ronde_planned_profile_lines_profile ON data_ronde_planned_profile_lines(profile_id);`
  );
  store.db.exec(
    `CREATE TABLE IF NOT EXISTS data_holidays (
      id TEXT PRIMARY KEY,
      date_iso TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`
  );
  store.db.exec(`CREATE INDEX IF NOT EXISTS idx_data_holidays_date ON data_holidays(date_iso);`);

  store.db.exec("CREATE INDEX IF NOT EXISTS idx_ronde_request_batch ON ronde_entries(request_batch_id);");
  store.db.exec("CREATE INDEX IF NOT EXISTS idx_ronde_motif_type ON ronde_entries(motif_type_id);");
  const motifSeedCount = store.db.prepare("SELECT COUNT(*) as n FROM data_ronde_motif_types").get();
  if (motifSeedCount && Number(motifSeedCount.n) === 0) {
    const nowSeed = new Date().toISOString();
    const seeds = [["AUTRE", "Autre (précision obligatoire)", 1, "#455a64", 0]];
    const insertMotif = store.db.prepare(
      `INSERT INTO data_ronde_motif_types (id, label, requires_free_text, color_hex, sort_order, legacy_code, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const [legacy, label, req, color, ord] of seeds) {
      insertMotif.run(generateEntityId(), label, req ? 1 : 0, color, ord, legacy, nowSeed);
    }
  }
}

module.exports = {
  ensureRondeSchema
};
