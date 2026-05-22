/**
 * Consultation du journal d'audit (`audit_logs`) pour l'écran Paramètres.
 *
 * Lecture seule : les écritures passent par `store/core/audit.js` (`logAudit` / `writeAudit`).
 * Accès restreint aux profils station admin (DEV ou RESPONSABLE avec profil métier autorisé).
 */

const authUsersDomain = require("./authUsers");

/**
 * Liste les derniers événements d'audit, avec libellés affichables pour les acteurs et cibles.
 *
 * Les logins techniques sont remplacés par `full_name` quand l'utilisateur existe encore en base ;
 * sinon le login est conservé. L'acteur vide devient `"system"`.
 *
 * @param {import('../userStore')} store
 * @param {object} options
 * @param {string} options.requesterUsername - Compte demandeur (contrôle RBAC).
 * @param {object} options.role - Constantes de rôles (`ROLE` depuis `userStore`).
 * @param {number} [options.limit=200] - Nombre de lignes (borné entre 1 et 1000).
 * @returns {Array<{ occurredAt: string, actorUsername: string, action: string, targetUsername: string|null, status: string, details: object|null }>}
 */
function listAuditLogs(store, { requesterUsername, limit = 200, role }) {
  authUsersDomain.ensureStationAdminAccess(store, requesterUsername, role, "audit:list");

  const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 1000));
  const rows = store.db
    .prepare(
      `SELECT occurred_at, actor_username, action, target_username, status, details_json
       FROM audit_logs
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(safeLimit);
  const userRows = store.db.prepare("SELECT username, full_name FROM users").all();
  const displayNameByUsername = new Map(
    userRows.map((userRow) => [String(userRow.username || ""), String(userRow.full_name || "").trim()])
  );
  const toDisplayName = (value) => {
    const username = String(value || "").trim();
    if (!username) return null;
    const displayName = displayNameByUsername.get(username);
    return displayName || username;
  };

  return rows.map((row) => ({
    occurredAt: row.occurred_at,
    actorUsername: toDisplayName(row.actor_username) || "system",
    action: row.action,
    targetUsername: toDisplayName(row.target_username),
    status: row.status,
    details: row.details_json ? JSON.parse(row.details_json) : null
  }));
}

/**
 * Retourne les bornes temporelles et le volume total du journal (filtres / export Paramètres).
 *
 * @param {import('../userStore')} store
 * @param {object} options
 * @param {string} options.requesterUsername
 * @param {object} options.role - Constantes `ROLE`.
 * @returns {{ firstOccurredAt: string|null, lastOccurredAt: string|null, total: number }}
 */
function getAuditMetadata(store, { requesterUsername, role }) {
  authUsersDomain.ensureStationAdminAccess(store, requesterUsername, role, "audit:metadata");

  const row = store.db
    .prepare(
      `SELECT MIN(occurred_at) AS first_occurred_at, MAX(occurred_at) AS last_occurred_at, COUNT(*) AS total
       FROM audit_logs`
    )
    .get();
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
