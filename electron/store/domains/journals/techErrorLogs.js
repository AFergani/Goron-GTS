/**
 * Journal technique local des événements PostgreSQL (`gts-pg-events.log` dans userData).
 *
 * Affiché dans Paramètres → Journal (section technique).
 * Distinct de `audit_logs` (métier). Connexion PG et sauvegardes : fichier local uniquement.
 *
 * @module electron/store/domains/journals/techErrorLogs
 */

const authUsersDomain = require("../users/authUsers");
const { readPostgresEvents } = require("../../persistence/postgresEventLog");

/** Libellés français des codes du journal technique local. */
const TECH_CODE_LABELS = {
  PG_LAB_UNREACHABLE: "PostgreSQL injoignable au démarrage",
  PG_LAB_CONNECTION_LOST: "Perte de connexion PostgreSQL",
  PG_LAB_CONNECTION_RESTORED: "Reconnexion PostgreSQL",
  PG_UNAVAILABLE: "Base PostgreSQL inaccessible",
  PG_BACKUP_AUTO_OK: "Sauvegarde journalière PostgreSQL enregistrée",
  PG_BACKUP_MANUAL_OK: "Sauvegarde manuelle PostgreSQL enregistrée",
  PG_BACKUP_FAILED: "Sauvegarde PostgreSQL impossible",
  PG_BACKUP_RESTORE_OK: "Restauration PostgreSQL terminée",
  PG_BACKUP_RESTORE_FAILED: "Restauration PostgreSQL impossible",
  PG_BACKUP_COMPARE_OK: "Comparaison dump / base actuelle terminée",
  PG_BACKUP_COMPARE_FAILED: "Comparaison dump / base actuelle impossible"
};

/**
 * Liste les derniers événements PG du poste.
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterUsername: string, limit?: number, role: object }} payload
 * @returns {Promise<Array<{ occurredAt: string, source: string, code: string, codeLabel: string, messageFr: string, details: object|null }>>}
 */
async function listTechErrorLogs(store, { requesterUsername, limit = 200, role }) {
  authUsersDomain.ensureStationAdminAccess(store, requesterUsername, role, "techLogs:list");
  const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 500));
  const rows = readPostgresEvents({
    limit: safeLimit,
    filePath:
      typeof store.resolvePostgresEventLogPath === "function" ? store.resolvePostgresEventLogPath() : undefined
  });
  return rows.map((row) => ({
    occurredAt: row.occurredAt,
    source: row.source,
    code: row.code,
    codeLabel: TECH_CODE_LABELS[row.code] || row.code,
    messageFr: row.messageFr,
    details: row.details
  }));
}

module.exports = {
  listTechErrorLogs
};
