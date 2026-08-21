-- Goron-GTS — schéma PostgreSQL unique (labo / production V1)
-- Appliqué au branchement du pool (applyPostgresMigrations).
-- Idempotent : CREATE TABLE / INDEX IF NOT EXISTS.
-- Drapeaux booléens : INTEGER 0/1. Horodatages : TEXT ISO.

-- ---------------------------------------------------------------------------
-- Section : audit_logs + historique d'entité
-- Journal technique poste : fichier local `gts-pg-events.log` (pas de table SQL).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  actor_username TEXT NOT NULL,
  action TEXT NOT NULL,
  target_username TEXT,
  status TEXT NOT NULL,
  details_json TEXT
);

DROP TABLE IF EXISTS error_logs;

CREATE INDEX IF NOT EXISTS idx_audit_logs_occurred_at ON audit_logs (occurred_at DESC);

CREATE TABLE IF NOT EXISTS entity_change_history (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  snapshot_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entity_change_history_lookup
  ON entity_change_history (entity_type, entity_id, changed_at DESC);


-- ---------------------------------------------------------------------------
-- Section : referentials
-- ---------------------------------------------------------------------------
-- Sites, intervenants, types d'anomalie — identifiants TEXT, horodatages TEXT ISO.

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

CREATE TABLE IF NOT EXISTS data_intervenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

-- Files d'attente partagées (anciennement intervention_*_pending).
ALTER TABLE IF EXISTS intervention_site_pending RENAME TO data_site_pending;
ALTER TABLE IF EXISTS intervention_intervenant_pending RENAME TO data_intervenant_pending;
ALTER INDEX IF EXISTS idx_intervention_site_pending_created RENAME TO idx_data_site_pending_created;
ALTER INDEX IF EXISTS idx_intervention_intervenant_pending_created RENAME TO idx_data_intervenant_pending_created;

CREATE TABLE IF NOT EXISTS data_site_pending (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS data_intervenant_pending (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS data_anomaly_types (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  color_hex TEXT NOT NULL DEFAULT '#1f5fcf',
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_data_sites_name ON data_sites (name);
CREATE INDEX IF NOT EXISTS idx_data_intervenants_name ON data_intervenants (name);
CREATE INDEX IF NOT EXISTS idx_data_anomaly_types_label ON data_anomaly_types (label);
CREATE INDEX IF NOT EXISTS idx_data_site_pending_created ON data_site_pending (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_intervenant_pending_created ON data_intervenant_pending (created_at DESC);


-- ---------------------------------------------------------------------------
-- Section : holidays
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_holidays (
  id TEXT PRIMARY KEY,
  date_iso TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_data_holidays_date ON data_holidays (date_iso);


-- ---------------------------------------------------------------------------
-- Section : data_motifs_fransor_resp
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_ronde_motif_types (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  requires_free_text INTEGER NOT NULL DEFAULT 0,
  color_hex TEXT NOT NULL DEFAULT '#5c6bc0',
  sort_order INTEGER NOT NULL DEFAULT 0,
  legacy_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

ALTER TABLE data_ronde_motif_types ADD COLUMN IF NOT EXISTS updated_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_data_ronde_motif_types_label_lower
  ON data_ronde_motif_types (lower(trim(label)));

CREATE INDEX IF NOT EXISTS idx_data_ronde_motif_types_sort
  ON data_ronde_motif_types (sort_order, label);

CREATE TABLE IF NOT EXISTS fransor_responsables (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fransor_responsables_name_active
  ON fransor_responsables (lower(name))
  WHERE is_active = 1;

CREATE INDEX IF NOT EXISTS idx_fransor_responsables_active_name
  ON fransor_responsables (is_active, name);


-- ---------------------------------------------------------------------------
-- Section : users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  manager_profile TEXT,
  theme_mode TEXT,
  page_access_json TEXT,
  password_hash TEXT NOT NULL,
  password_history_json TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  is_locked INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_full_name_lower ON users (lower(full_name));
CREATE INDEX IF NOT EXISTS idx_users_active_username ON users (is_active, username);

-- Postes déjà migrés : ajoute la colonne historique MDP si absente (PG 18).
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_history_json TEXT;

-- Présence multi-postes (badge « connecté » partagé via PostgreSQL).
CREATE TABLE IF NOT EXISTS user_presence (
  username TEXT PRIMARY KEY,
  session_token TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  hostname TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_presence_last_seen ON user_presence (last_seen_at DESC);


-- ---------------------------------------------------------------------------
-- Section : form_variables
-- ---------------------------------------------------------------------------
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

CREATE TABLE IF NOT EXISTS data_form_variable_assignments (
  id TEXT PRIMARY KEY,
  variable_id TEXT NOT NULL,
  assignment_kind TEXT NOT NULL,
  assignment_value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_form_variable_sort ON data_form_variables (sort_order, label);
CREATE INDEX IF NOT EXISTS idx_form_variable_assignments_var
  ON data_form_variable_assignments (variable_id, assignment_kind);


-- ---------------------------------------------------------------------------
-- Section : document_template_assignments
-- ---------------------------------------------------------------------------
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_template_assign_unique
  ON data_document_template_assignments (flow_kind, scope_kind, scope_value);


-- ---------------------------------------------------------------------------
-- Section : fransor_metier
-- ---------------------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_fransor_closures_period
  ON fransor_closures (start_date, end_date);

CREATE TABLE IF NOT EXISTS fransor_accompagnements (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  responsable_id TEXT NOT NULL,
  ouverture_done INTEGER NOT NULL DEFAULT 0,
  fermeture_done INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fransor_entry_unique
  ON fransor_accompagnements (date, responsable_id);

CREATE INDEX IF NOT EXISTS idx_fransor_entry_date
  ON fransor_accompagnements (date DESC);


-- ---------------------------------------------------------------------------
-- Section : main_courante
-- ---------------------------------------------------------------------------
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
  updated_at TEXT NOT NULL
);

ALTER TABLE main_courante_entries ADD COLUMN IF NOT EXISTS consulted_by_operator_at TEXT;
ALTER TABLE main_courante_entries DROP COLUMN IF EXISTS archived_at;
ALTER TABLE main_courante_entries DROP COLUMN IF EXISTS archived_by;
ALTER TABLE main_courante_entries DROP COLUMN IF EXISTS archive_reason;

CREATE INDEX IF NOT EXISTS idx_main_courante_created
  ON main_courante_entries (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_main_courante_status
  ON main_courante_entries (status);

DROP INDEX IF EXISTS idx_main_courante_status_archived;


-- ---------------------------------------------------------------------------
-- Section : intervention
-- ---------------------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_intervention_request_dt
  ON intervention_entries (request_date DESC, request_time DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_intervention_status_archived
  ON intervention_entries (status, archived_at);
CREATE INDEX IF NOT EXISTS idx_intervention_site_id
  ON intervention_entries (site_id);
CREATE INDEX IF NOT EXISTS idx_intervention_intervenant_id
  ON intervention_entries (intervenant_id);
CREATE INDEX IF NOT EXISTS idx_intervention_word_extra_sort
  ON data_intervention_word_extra_fields (sort_order, label);


-- ---------------------------------------------------------------------------
-- Section : gardiennage
-- ---------------------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_gardiennage_site
  ON gardiennage_entries (site_id);
CREATE INDEX IF NOT EXISTS idx_gardiennage_status
  ON gardiennage_entries (status);
CREATE INDEX IF NOT EXISTS idx_gardiennage_dates
  ON gardiennage_entries (recurrence_start_date DESC, recurrence_end_date);
CREATE INDEX IF NOT EXISTS idx_gardiennage_batch
  ON gardiennage_entries (planning_batch_id);
CREATE INDEX IF NOT EXISTS idx_gardiennage_intervention
  ON gardiennage_entries (intervention_id);


-- ---------------------------------------------------------------------------
-- Section : ronde
-- ---------------------------------------------------------------------------
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
  cancellation_request_reason TEXT,
  cancellation_requested_at TEXT,
  cancellation_requested_by TEXT,
  validated_at TEXT,
  validated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE data_ronde_planned_profiles ADD COLUMN IF NOT EXISTS cancellation_request_reason TEXT;
ALTER TABLE data_ronde_planned_profiles ADD COLUMN IF NOT EXISTS cancellation_requested_at TEXT;
ALTER TABLE data_ronde_planned_profiles ADD COLUMN IF NOT EXISTS cancellation_requested_by TEXT;

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

CREATE TABLE IF NOT EXISTS ronde_entries (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'URGENCE',
  origin_intervention_id TEXT,
  site_id TEXT,
  site_display TEXT NOT NULL DEFAULT '',
  request_date TEXT NOT NULL,
  motif_category TEXT NOT NULL DEFAULT '',
  motif_other TEXT,
  horaires_demande_obs TEXT,
  origin_kind TEXT NOT NULL DEFAULT 'TELESURVEILLANCE',
  origin_detail TEXT,
  intervenant_id TEXT,
  intervenant_name TEXT NOT NULL DEFAULT '',
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
  status TEXT NOT NULL DEFAULT 'EN_COURS',
  cancellation_reason TEXT,
  closed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_ronde_request_date ON ronde_entries (request_date DESC);
CREATE INDEX IF NOT EXISTS idx_ronde_status ON ronde_entries (status);
CREATE INDEX IF NOT EXISTS idx_ronde_request_batch ON ronde_entries (request_batch_id);
CREATE INDEX IF NOT EXISTS idx_ronde_motif_type ON ronde_entries (motif_type_id);
CREATE INDEX IF NOT EXISTS idx_ronde_origin_intervention ON ronde_entries (origin_intervention_id);
CREATE INDEX IF NOT EXISTS idx_ronde_planned_profile ON ronde_entries (planned_profile_id);
CREATE INDEX IF NOT EXISTS idx_ronde_planned_profiles_active
  ON data_ronde_planned_profiles (is_active, label);
CREATE INDEX IF NOT EXISTS idx_ronde_planned_profile_lines_profile
  ON data_ronde_planned_profile_lines (profile_id, sort_order);

