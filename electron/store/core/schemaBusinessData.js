/**
 * Schéma SQLite des données de configuration métier : champs Word intervention, variables de formulaire,
 * assignations de modèles documentaires.
 *
 * Complète `schemaBase.js` dans `UserStore.ensureSchema()` (après users/sites, avant ou avec les autres extensions).
 */

/**
 * Crée les tables et index liés aux paramètres « données » et exports documentaires.
 *
 * Tables :
 * - `data_intervention_word_extra_fields` — colonnes supplémentaires export Word intervention.
 * - `data_form_variables` / `data_form_variable_assignments` — variables dynamiques par contexte.
 * - `data_document_template_assignments` — modèle `.docx` par flux et portée (site, profil, etc.).
 *
 * @param {import('../userStore')} store
 * @returns {void}
 */
function ensureBusinessDataSchema(store) {
  store.db.exec(`
    CREATE TABLE IF NOT EXISTS data_intervention_word_extra_fields (
      id TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL DEFAULT 0,
      field_key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      field_type TEXT NOT NULL DEFAULT 'text',
      placeholder TEXT NOT NULL DEFAULT '',
      options_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  store.db.exec(`
    CREATE TABLE IF NOT EXISTS data_form_variables (
      id TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL DEFAULT 0,
      field_key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      field_type TEXT NOT NULL DEFAULT 'text',
      placeholder TEXT NOT NULL DEFAULT '',
      required INTEGER NOT NULL DEFAULT 0,
      options_json TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  store.db.exec(`
    CREATE TABLE IF NOT EXISTS data_form_variable_assignments (
      id TEXT PRIMARY KEY,
      variable_id TEXT NOT NULL,
      assignment_kind TEXT NOT NULL,
      assignment_value TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  store.db.exec("CREATE INDEX IF NOT EXISTS idx_form_variable_sort ON data_form_variables(sort_order, label);");
  store.db.exec(
    "CREATE INDEX IF NOT EXISTS idx_form_variable_assignments_var ON data_form_variable_assignments(variable_id, assignment_kind);"
  );

  store.db.exec(`
    CREATE TABLE IF NOT EXISTS data_document_template_assignments (
      id TEXT PRIMARY KEY,
      flow_kind TEXT NOT NULL,
      scope_kind TEXT NOT NULL,
      scope_value TEXT NOT NULL,
      scope_label TEXT NOT NULL,
      template_file_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  store.db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_template_assign_unique ON data_document_template_assignments(flow_kind, scope_kind, scope_value);"
  );
}

module.exports = {
  ensureBusinessDataSchema
};
