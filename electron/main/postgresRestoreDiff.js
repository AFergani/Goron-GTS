/**
 * Tables métier et client PostgreSQL pour la comparaison dump ↔ base actuelle.
 *
 * Le résultat est affiché dans l'application. Aucun rapport HTML n'est produit.
 *
 * @module electron/main/postgresRestoreDiff
 */

const { Client } = require("pg");

/** Tables métier suivies (identifiants SQL figés, jamais interpolés depuis l'UI). */
const METRICS = [
  {
    table: "users",
    label: "Comptes utilisateurs",
    labelSql: "COALESCE(full_name,'') || ' (' || COALESCE(username,'') || ')'"
  },
  {
    table: "data_sites",
    label: "Sites",
    labelSql: "COALESCE(code,'') || ' — ' || COALESCE(name,'')"
  },
  {
    table: "data_intervenants",
    label: "Intervenants",
    labelSql: "COALESCE(name,'')"
  },
  {
    table: "data_anomaly_types",
    label: "Types d'anomalie",
    labelSql: "COALESCE(label,'')"
  },
  {
    table: "data_holidays",
    label: "Jours fériés",
    labelSql: "COALESCE(date_iso,'') || ' — ' || COALESCE(label,'')"
  },
  {
    table: "data_ronde_motif_types",
    label: "Motifs de ronde",
    labelSql: "COALESCE(label,'')"
  },
  {
    table: "data_ronde_planned_profiles",
    label: "Profils de ronde contractuelle",
    labelSql: "COALESCE(label,'')"
  },
  {
    table: "main_courante_entries",
    label: "Main courante",
    labelSql: "COALESCE(site_display,'') || ' — ' || left(COALESCE(information,''), 90)"
  },
  {
    table: "intervention_entries",
    label: "Interventions",
    labelSql: "COALESCE(site_display,'') || ' — ' || COALESCE(request_date,'') || ' ' || COALESCE(request_time,'')"
  },
  {
    table: "ronde_entries",
    label: "Rondes",
    labelSql: "COALESCE(site_display,'') || ' — ' || COALESCE(created_at,'')"
  },
  {
    table: "gardiennage_entries",
    label: "Gardiennages",
    labelSql: "COALESCE(site_display,'') || ' — ' || COALESCE(intervenant_name,'')"
  },
  {
    table: "fransor_accompagnements",
    label: "Fransor — accompagnements",
    labelSql: "COALESCE(date,'') || ' — responsable ' || COALESCE(responsable_id,'')"
  },
  {
    table: "fransor_closures",
    label: "Fransor — clôtures",
    labelSql: "COALESCE(label,'') || ' (' || COALESCE(start_date,'') || ' → ' || COALESCE(end_date,'') || ')'"
  },
  {
    table: "audit_logs",
    label: "Journal d'actions",
    labelSql: "COALESCE(occurred_at,'') || ' — ' || COALESCE(action,'')",
    includeInCompare: false
  }
];

/**
 * Client `pg` vers une base (comparaison dump / live).
 *
 * @param {object} cfg
 * @param {string} [database]
 * @returns {import('pg').Client}
 */
function createPgClient(cfg, database) {
  return new Client({
    host: cfg.host,
    port: cfg.port,
    database: String(database || cfg.database || "").trim() || cfg.database,
    user: cfg.user,
    password: cfg.password,
    connectionTimeoutMillis: cfg.connectionTimeoutMillis || 2500
  });
}

module.exports = {
  METRICS,
  createPgClient
};
