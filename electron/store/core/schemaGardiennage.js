/**
 * Schéma SQLite du module gardiennage : table `gardiennage_entries` et index de consultation.
 *
 * Dernier bloc appelé dans `UserStore.ensureSchema()` (après base, ronde, users/sites, business data).
 * Aligné avec `store/domains/gardiennage.js` (planification, snapshot, statuts, lien ronde/intervention).
 */

/**
 * Crée la table des demandes de gardiennage et index sur site, statut et plage de récurrence.
 *
 * Colonnes notables : horaires, récurrence, ponctuel, intervenant, notes, clôture, snapshot de planification
 * (`planning_batch_id`, `planning_snapshot_json`, créneaux), lien `linked_ronde_id`.
 *
 * @param {import('../userStore')} store
 * @returns {void}
 */
function ensureGardiennageSchema(store) {
  store.db.exec(`
    CREATE TABLE IF NOT EXISTS gardiennage_entries (
      id TEXT PRIMARY KEY,
      site_id TEXT,
      site_display TEXT NOT NULL DEFAULT '',
      start_time TEXT NOT NULL DEFAULT '',
      end_time TEXT NOT NULL DEFAULT '',
      crosses_midnight INTEGER NOT NULL DEFAULT 0,
      recurrence_start_date TEXT NOT NULL DEFAULT '',
      recurrence_end_date TEXT NOT NULL DEFAULT '',
      recurrence_days INTEGER NOT NULL DEFAULT 127,
      is_ponctuel INTEGER NOT NULL DEFAULT 0,
      intervenant_id TEXT,
      intervenant_name TEXT NOT NULL DEFAULT '',
      intervention_id TEXT,
      notes TEXT NOT NULL DEFAULT '',
      closure_report TEXT NOT NULL DEFAULT '',
      actual_start_time TEXT NOT NULL DEFAULT '',
      actual_end_time TEXT NOT NULL DEFAULT '',
      work_order_number TEXT NOT NULL DEFAULT '',
      cancellation_reason TEXT NOT NULL DEFAULT '',
      linked_ronde_id TEXT,
      planning_batch_id TEXT,
      planning_snapshot_json TEXT,
      planning_slot_start TEXT NOT NULL DEFAULT '',
      planning_slot_end TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'PLANIFIE',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  store.db.exec("CREATE INDEX IF NOT EXISTS idx_gardiennage_site ON gardiennage_entries(site_id);");
  store.db.exec("CREATE INDEX IF NOT EXISTS idx_gardiennage_status ON gardiennage_entries(status);");
  store.db.exec("CREATE INDEX IF NOT EXISTS idx_gardiennage_dates ON gardiennage_entries(recurrence_start_date, recurrence_end_date);");
}

module.exports = {
  ensureGardiennageSchema
};
