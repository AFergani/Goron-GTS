/**
 * Consultation du journal technique local des événements PostgreSQL (`gts-pg-events.log`).
 *
 * Affiché dans Paramètres → Journal (section technique).
 *
 * @module electron/store/domains/journals/techErrorLogs
 */

const authUsersDomain = require("../users/authUsers");
const { readPostgresEvents } = require("../../persistence/postgresEventLog");

const TECH_CODE_LABELS = {
  PG_LAB_UNREACHABLE: "PostgreSQL injoignable au démarrage",
  PG_LAB_CONNECTION_LOST: "Perte de connexion PostgreSQL",
  PG_LAB_CONNECTION_RESTORED: "Reconnexion PostgreSQL",
  PG_UNAVAILABLE: "Base PostgreSQL inaccessible"
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
    filePath: typeof store.resolvePostgresEventLogPath === "function" ? store.resolvePostgresEventLogPath() : undefined
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
  listTechErrorLogs,
  TECH_CODE_LABELS
};
