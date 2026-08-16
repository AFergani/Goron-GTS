/**
 * Consultation du journal d'audit (`audit_logs`) pour l'écran Paramètres.
 *
 * Lecture seule : les écritures passent par `store/core/audit.js` (`logAudit` / `writeAudit`).
 * Accès restreint aux profils station admin (DEV ou RESPONSABLE avec profil métier autorisé).
 * Les lignes viennent de PostgreSQL uniquement via `store.getAuditPersistence()`.
 * Si PG est injoignable : refus explicite (pas de repli SQLite silencieux).
 * Les noms d'affichage des acteurs restent enrichis depuis `users` (PostgreSQL).
 *
 * @module electron/store/domains/journals/auditLogs
 */

const authUsersDomain = require("../users/authUsers");

/**
 * Liste les derniers événements d'audit, avec libellés affichables pour les acteurs et cibles.
 *
 * @param {import('../../../userStore')} store
 * @param {object} options
 * @param {string} options.requesterUsername - Compte demandeur (contrôle RBAC).
 * @param {object} options.role - Constantes de rôles (`ROLE` depuis `userStore`).
 * @param {number} [options.limit=200] - Nombre de lignes (borné entre 1 et 1000).
 * @returns {Promise<Array<{ occurredAt: string, actorUsername: string, action: string, targetUsername: string|null, status: string, details: object|null }>>}
 */
async function listAuditLogs(store, { requesterUsername, limit = 200, role }) {
  authUsersDomain.ensureStationAdminAccess(store, requesterUsername, role, "audit:list");

  const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 1000));
  const auditDb = typeof store.getAuditPersistence === "function" ? store.getAuditPersistence() : null;
  if (!auditDb) {
    store.fail(
      "audit:list",
      "Base PostgreSQL inaccessible. Le journal d'actions ne peut pas être consulté tant que le serveur n'est pas disponible.",
      "PG_UNAVAILABLE"
    );
  }

  const rows = await auditDb.all(
    `SELECT occurred_at, actor_username, action, target_username, status, details_json
     FROM audit_logs
     ORDER BY id DESC
     LIMIT ?`,
    [safeLimit]
  );

  const userRows =
    typeof store.getUsersPersistence === "function" && store.getUsersPersistence()
      ? await store.getUsersPersistence().all(`SELECT username, full_name FROM users`, [])
      : [];
  const displayNameByUsername = new Map(
    userRows.map((userRow) => [String(userRow.username || ""), String(userRow.full_name || "").trim()])
  );
  const toDisplayName = (value) => {
    const username = String(value || "").trim();
    if (!username) return null;
    const displayName = displayNameByUsername.get(username);
    return displayName || username;
  };

  return rows.map((row) => {
    let details = null;
    if (row.details_json) {
      if (typeof row.details_json === "object") {
        details = row.details_json;
      } else {
        try {
          details = JSON.parse(String(row.details_json));
        } catch {
          details = { raw: String(row.details_json) };
        }
      }
    }
    return {
      occurredAt: row.occurred_at,
      actorUsername: toDisplayName(row.actor_username) || "system",
      action: row.action,
      targetUsername: toDisplayName(row.target_username),
      status: row.status,
      details
    };
  });
}

/**
 * Retourne les bornes temporelles et le volume total du journal (filtres / export Paramètres).
 *
 * @param {import('../../../userStore')} store
 * @param {object} options
 * @param {string} options.requesterUsername
 * @param {object} options.role - Constantes `ROLE`.
 * @returns {Promise<{ firstOccurredAt: string|null, lastOccurredAt: string|null, total: number }>}
 */
async function getAuditMetadata(store, { requesterUsername, role }) {
  authUsersDomain.ensureStationAdminAccess(store, requesterUsername, role, "audit:metadata");

  const auditDb = typeof store.getAuditPersistence === "function" ? store.getAuditPersistence() : null;
  if (!auditDb) {
    store.fail(
      "audit:metadata",
      "Base PostgreSQL inaccessible. Le journal d'actions ne peut pas être consulté tant que le serveur n'est pas disponible.",
      "PG_UNAVAILABLE"
    );
  }

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
