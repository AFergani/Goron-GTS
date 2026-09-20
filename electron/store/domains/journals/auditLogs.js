/**
 * Consultation du journal d'audit (`audit_logs`) pour Paramètres → Journal.
 *
 * Lecture seule : les écritures passent par `UserStore.logAudit` → `writeAudit`.
 * Accès : profils station admin (`ensureStationAdminAccess`).
 * Acteurs / cibles enrichis avec `full_name` depuis `users` (repli = login).
 * Les identifiants `system:…` (dump auto, clôture auto, etc.) s'affichent « Système ».
 *
 * @module electron/store/domains/journals/auditLogs
 */

const authUsersDomain = require("../users/authUsers");

/**
 * Exige l'adaptateur audit PostgreSQL.
 *
 * @param {import('../../../userStore')} store
 * @param {string} source
 * @returns {import('../../persistence/persistenceContract').PersistenceAdapter}
 */
function requireAuditPersistence(store, source) {
  const auditDb = typeof store.getAuditPersistence === "function" ? store.getAuditPersistence() : null;
  if (!auditDb) {
    store.fail(
      source,
      "Base PostgreSQL inaccessible. Le journal d'actions ne peut pas être consulté tant que le serveur n'est pas disponible.",
      "PG_UNAVAILABLE"
    );
  }
  return auditDb;
}

/**
 * Parse `details_json` (`jsonb` objet ou texte JSON).
 *
 * @param {unknown} raw
 * @returns {object|null}
 */
function parseAuditDetails(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { raw: String(raw) };
  } catch {
    return { raw: String(raw) };
  }
}

/**
 * Map login → nom affiché (référentiel utilisateurs).
 *
 * @param {import('../../../userStore')} store
 * @returns {Promise<Map<string, string>>}
 */
async function loadDisplayNameByUsername(store) {
  const usersDb = typeof store.getUsersPersistence === "function" ? store.getUsersPersistence() : null;
  if (!usersDb) return new Map();
  const userRows = await usersDb.all("SELECT username, full_name FROM users", []);
  return new Map(
    userRows.map((row) => [String(row.username || ""), String(row.full_name || "").trim()])
  );
}

/**
 * @param {Map<string, string>} displayNameByUsername
 * @param {unknown} value
 * @returns {string|null}
 */
function toDisplayName(displayNameByUsername, value) {
  const username = String(value || "").trim();
  if (!username) return null;
  if (username === "system" || username.toLowerCase().startsWith("system:")) {
    return "Système";
  }
  return displayNameByUsername.get(username) || username;
}

/**
 * Liste les derniers événements d'audit (libellés affichables pour acteurs et cibles).
 *
 * @param {import('../../../userStore')} store
 * @param {object} options
 * @param {string} options.requesterUsername
 * @param {object} options.role - Constantes `ROLE` (`userStore`)
 * @param {number} [options.limit=200] - Borné entre 1 et 1000
 * @returns {Promise<Array<{ occurredAt: string, actorUsername: string, action: string, targetUsername: string|null, status: string, details: object|null }>>}
 */
async function listAuditLogs(store, { requesterUsername, limit = 200, role }) {
  authUsersDomain.ensureStationAdminAccess(store, requesterUsername, role, "audit:list");
  const auditDb = requireAuditPersistence(store, "audit:list");
  const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 1000));
  const rows = await auditDb.all(
    `SELECT occurred_at, actor_username, action, target_username, status, details_json
     FROM audit_logs
     ORDER BY id DESC
     LIMIT ?`,
    [safeLimit]
  );
  const displayNameByUsername = await loadDisplayNameByUsername(store);
  return rows.map((row) => ({
    occurredAt: row.occurred_at,
    actorUsername: toDisplayName(displayNameByUsername, row.actor_username) || "system",
    action: row.action,
    targetUsername: toDisplayName(displayNameByUsername, row.target_username),
    status: row.status,
    details: parseAuditDetails(row.details_json)
  }));
}

/**
 * Bornes temporelles et volume total du journal (filtres / export Paramètres).
 *
 * @param {import('../../../userStore')} store
 * @param {object} options
 * @param {string} options.requesterUsername
 * @param {object} options.role
 * @returns {Promise<{ firstOccurredAt: string|null, lastOccurredAt: string|null, total: number }>}
 */
async function getAuditMetadata(store, { requesterUsername, role }) {
  authUsersDomain.ensureStationAdminAccess(store, requesterUsername, role, "audit:metadata");
  const auditDb = requireAuditPersistence(store, "audit:metadata");
  const row = await auditDb.get(
    `SELECT MIN(occurred_at) AS first_occurred_at, MAX(occurred_at) AS last_occurred_at, COUNT(*) AS total
     FROM audit_logs`,
    []
  );
  return {
    firstOccurredAt: row?.first_occurred_at || null,
    lastOccurredAt: row?.last_occurred_at || null,
    total: Number(row?.total || 0)
  };
}

module.exports = {
  listAuditLogs,
  getAuditMetadata
};
