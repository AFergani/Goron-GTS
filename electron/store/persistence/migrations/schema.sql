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

-- Compteurs de numéro métier JJMMAAAA-XX (séquence par domaine et par jour).
CREATE TABLE IF NOT EXISTS daily_entry_counters (
  domain TEXT NOT NULL,
  day_iso TEXT NOT NULL,
  last_seq INTEGER NOT NULL,
  PRIMARY KEY (domain, day_iso)
);


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

-- Horodatage du verrouillage : permet le déverrouillage automatique après expiration du délai.
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_at TEXT;

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
  entry_stage TEXT NOT NULL DEFAULT 'CLOSURE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE data_form_variables ADD COLUMN IF NOT EXISTS entry_stage TEXT NOT NULL DEFAULT 'CLOSURE';

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
  updated_at TEXT NOT NULL,
  daily_code TEXT
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

ALTER TABLE main_courante_entries ADD COLUMN IF NOT EXISTS daily_code TEXT;
ALTER TABLE main_courante_entries ADD COLUMN IF NOT EXISTS export_extra_json TEXT NOT NULL DEFAULT '{}';
UPDATE main_courante_entries e
SET daily_code = sub.code
FROM (
  SELECT id,
    to_char((created_at::timestamptz AT TIME ZONE 'Europe/Paris')::date, 'DDMMYYYY')
    || '-' || lpad(
      ROW_NUMBER() OVER (
        PARTITION BY (created_at::timestamptz AT TIME ZONE 'Europe/Paris')::date
        ORDER BY created_at, id
      )::text, 2, '0'
    ) AS code
  FROM main_courante_entries
  WHERE daily_code IS NULL AND created_at IS NOT NULL AND TRIM(created_at) <> ''
) sub
WHERE e.id = sub.id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_main_courante_daily_code
  ON main_courante_entries (daily_code);


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
  export_extra_json TEXT DEFAULT '{}',
  cancellation_reason TEXT,
  closed_at TEXT,
  archived_at TEXT,
  daily_code TEXT
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

-- Colonnes de facturation retirées (idempotent si absentes).
ALTER TABLE intervention_entries DROP COLUMN IF EXISTS billing_status;
ALTER TABLE intervention_entries DROP COLUMN IF EXISTS billing_reason;

ALTER TABLE intervention_entries ADD COLUMN IF NOT EXISTS daily_code TEXT;
UPDATE intervention_entries e
SET daily_code = sub.code
FROM (
  SELECT id,
    to_char(to_date(request_date, 'YYYY-MM-DD'), 'DDMMYYYY')
    || '-' || lpad(ROW_NUMBER() OVER (PARTITION BY request_date ORDER BY created_at, id)::text, 2, '0') AS code
  FROM intervention_entries
  WHERE daily_code IS NULL AND request_date ~ '^\d{4}-\d{2}-\d{2}$'
) sub
WHERE e.id = sub.id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_intervention_daily_code
  ON intervention_entries (daily_code);


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
  updated_at TEXT NOT NULL,
  daily_code TEXT
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

ALTER TABLE gardiennage_entries ADD COLUMN IF NOT EXISTS daily_code TEXT;
ALTER TABLE gardiennage_entries ADD COLUMN IF NOT EXISTS export_extra_json TEXT NOT NULL DEFAULT '{}';
UPDATE gardiennage_entries e
SET daily_code = sub.code
FROM (
  SELECT id,
    to_char(to_date(recurrence_start_date, 'YYYY-MM-DD'), 'DDMMYYYY')
    || '-' || lpad(
      ROW_NUMBER() OVER (PARTITION BY recurrence_start_date ORDER BY created_at, id)::text, 2, '0'
    ) AS code
  FROM gardiennage_entries
  WHERE daily_code IS NULL AND recurrence_start_date ~ '^\d{4}-\d{2}-\d{2}$'
) sub
WHERE e.id = sub.id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_gardiennage_daily_code
  ON gardiennage_entries (daily_code);


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
  closed_at TEXT,
  daily_code TEXT
);

CREATE INDEX IF NOT EXISTS idx_ronde_request_date ON ronde_entries (request_date DESC);
CREATE INDEX IF NOT EXISTS idx_ronde_status ON ronde_entries (status);
CREATE INDEX IF NOT EXISTS idx_ronde_request_batch ON ronde_entries (request_batch_id);
CREATE INDEX IF NOT EXISTS idx_ronde_motif_type ON ronde_entries (motif_type_id);
CREATE INDEX IF NOT EXISTS idx_ronde_origin_intervention ON ronde_entries (origin_intervention_id);
CREATE INDEX IF NOT EXISTS idx_ronde_planned_profile ON ronde_entries (planned_profile_id);

ALTER TABLE ronde_entries ADD COLUMN IF NOT EXISTS cancellation_kind TEXT;
ALTER TABLE ronde_entries ADD COLUMN IF NOT EXISTS daily_code TEXT;
UPDATE ronde_entries e
SET daily_code = sub.code
FROM (
  SELECT id,
    to_char(to_date(request_date, 'YYYY-MM-DD'), 'DDMMYYYY')
    || '-' || lpad(ROW_NUMBER() OVER (PARTITION BY request_date ORDER BY created_at, id)::text, 2, '0') AS code
  FROM ronde_entries
  WHERE daily_code IS NULL AND request_date ~ '^\d{4}-\d{2}-\d{2}$'
) sub
WHERE e.id = sub.id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ronde_daily_code
  ON ronde_entries (daily_code);
ALTER TABLE ronde_entries ADD COLUMN IF NOT EXISTS arrival_date TEXT;
ALTER TABLE ronde_entries ADD COLUMN IF NOT EXISTS departure_date TEXT;
ALTER TABLE ronde_entries ADD COLUMN IF NOT EXISTS batch_suppressed_at TEXT;
ALTER TABLE ronde_entries ADD COLUMN IF NOT EXISTS batch_suppressed_by TEXT;
ALTER TABLE ronde_entries ADD COLUMN IF NOT EXISTS batch_suppressed_reason TEXT;

CREATE TABLE IF NOT EXISTS ronde_batch_delete_requests (
  request_batch_id TEXT PRIMARY KEY,
  reason TEXT NOT NULL DEFAULT '',
  requested_at TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  reviewed_at TEXT,
  reviewed_by TEXT,
  review_reason TEXT,
  site_display TEXT
);
ALTER TABLE ronde_batch_delete_requests ADD COLUMN IF NOT EXISTS site_display TEXT;
ALTER TABLE ronde_batch_delete_requests ADD COLUMN IF NOT EXISTS entry_ids_json TEXT;
CREATE INDEX IF NOT EXISTS idx_ronde_batch_delete_status ON ronde_batch_delete_requests (status);
CREATE INDEX IF NOT EXISTS idx_ronde_planned_profiles_active
  ON data_ronde_planned_profiles (is_active, label);
CREATE INDEX IF NOT EXISTS idx_ronde_planned_profile_lines_profile
  ON data_ronde_planned_profile_lines (profile_id, sort_order);

-- Aligne les compteurs sur les numéros déjà présents (idempotent).
INSERT INTO daily_entry_counters (domain, day_iso, last_seq)
SELECT 'intervention', request_date, COUNT(*)::int
FROM intervention_entries
WHERE daily_code IS NOT NULL AND request_date ~ '^\d{4}-\d{2}-\d{2}$'
GROUP BY request_date
ON CONFLICT (domain, day_iso) DO UPDATE
SET last_seq = GREATEST(daily_entry_counters.last_seq, EXCLUDED.last_seq);

INSERT INTO daily_entry_counters (domain, day_iso, last_seq)
SELECT 'ronde', request_date, COUNT(*)::int
FROM ronde_entries
WHERE daily_code IS NOT NULL AND request_date ~ '^\d{4}-\d{2}-\d{2}$'
GROUP BY request_date
ON CONFLICT (domain, day_iso) DO UPDATE
SET last_seq = GREATEST(daily_entry_counters.last_seq, EXCLUDED.last_seq);

INSERT INTO daily_entry_counters (domain, day_iso, last_seq)
SELECT 'gardiennage', recurrence_start_date, COUNT(*)::int
FROM gardiennage_entries
WHERE daily_code IS NOT NULL AND recurrence_start_date ~ '^\d{4}-\d{2}-\d{2}$'
GROUP BY recurrence_start_date
ON CONFLICT (domain, day_iso) DO UPDATE
SET last_seq = GREATEST(daily_entry_counters.last_seq, EXCLUDED.last_seq);

INSERT INTO daily_entry_counters (domain, day_iso, last_seq)
SELECT 'main_courante',
  to_char((created_at::timestamptz AT TIME ZONE 'Europe/Paris')::date, 'YYYY-MM-DD'),
  COUNT(*)::int
FROM main_courante_entries
WHERE daily_code IS NOT NULL AND created_at IS NOT NULL AND TRIM(created_at) <> ''
GROUP BY (created_at::timestamptz AT TIME ZONE 'Europe/Paris')::date
ON CONFLICT (domain, day_iso) DO UPDATE
SET last_seq = GREATEST(daily_entry_counters.last_seq, EXCLUDED.last_seq);

-- Instantané de remarque vidéo : une ligne par site du référentiel.
CREATE TABLE IF NOT EXISTS video_remark_snapshots (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_video_remark_snapshots_site ON video_remark_snapshots (site_id);

-- PV vidéo : une fiche de raccordement par site. Login et mot de passe chiffrés (pas en clair).
CREATE TABLE IF NOT EXISTS pv_video_reports (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL UNIQUE,
  connection_date TEXT NOT NULL DEFAULT '',
  tls_responsible_name TEXT NOT NULL DEFAULT '',
  technician_contact TEXT NOT NULL DEFAULT '',
  transmitter_code TEXT NOT NULL DEFAULT '',
  connection_method TEXT NOT NULL DEFAULT '',
  recorder_model TEXT NOT NULL DEFAULT '',
  recorder_ip TEXT NOT NULL DEFAULT '',
  recorder_port TEXT NOT NULL DEFAULT '',
  login_cipher TEXT NOT NULL DEFAULT '',
  password_cipher TEXT NOT NULL DEFAULT '',
  cameras_json TEXT NOT NULL DEFAULT '[]',
  image_relpath TEXT NOT NULL DEFAULT '',
  image_mime TEXT NOT NULL DEFAULT '',
  image_original_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pv_video_reports_site ON pv_video_reports (site_id);

-- Dossier partagé des photos de PV (chemin UNC ou local du serveur), une seule ligne.
CREATE TABLE IF NOT EXISTS pv_video_archive (
  id TEXT PRIMARY KEY,
  folder_path TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

