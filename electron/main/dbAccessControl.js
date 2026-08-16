/**
 * Contrôles d'accès RBAC liés à la base et aux opérations sensibles (archives, bascule de base).
 * Lit le cache utilisateurs PostgreSQL (`getCachedUserRow`) ; replis à `false` / `null` si indisponible.
 *
 * Instancié tôt dans `main.js` (`createDbAccessControlService`) et réinjecté dans `databaseAdmin.js`
 * ainsi que `ipcSystemHandlers.js` (archivage manuel, paramètres base).
 */

/**
 * Fabrique les vérifications de droits basées sur le rôle et le profil manager.
 *
 * @param {object} deps
 * @param {() => import('../userStore')|null} deps.getUserStore - Store courant.
 * @returns {{
 *   getActiveUserRole: (username: string) => string|null,
 *   canManageArchiveSession: (requesterUsername: string) => boolean,
 *   canRunArchiveManually: (requesterUsername: string) => boolean,
 *   canManageDatabase: (requesterUsername: string) => boolean
 * }}
 */
function createDbAccessControlService(deps) {
  const { getUserStore } = deps;

  /**
   * @param {string} username
   * @returns {object|null}
   */
  function getActiveUserRow(username) {
    const userStore = getUserStore();
    if (!userStore || typeof userStore.getCachedUserRow !== "function") return null;
    return userStore.getCachedUserRow(username);
  }

  /**
   * @param {string} username
   * @returns {string|null}
   */
  function getActiveUserRole(username) {
    return getActiveUserRow(username)?.role || null;
  }

  /**
   * @param {string} requesterUsername
   * @returns {boolean}
   */
  function canManageArchiveSession(requesterUsername) {
    const row = getActiveUserRow(requesterUsername);
    return Boolean(row && (row.role === "RESPONSABLE" || row.role === "DEV"));
  }

  /**
   * @param {string} requesterUsername
   * @returns {boolean}
   */
  function canRunArchiveManually(requesterUsername) {
    const row = getActiveUserRow(requesterUsername);
    if (!row) return false;
    if (row.role === "DEV") return true;
    if (row.role !== "RESPONSABLE") return false;
    return row.manager_profile === "DIRECTEUR_STATION" || row.manager_profile === "RESPONSABLE_STATION";
  }

  /**
   * @param {string} requesterUsername
   * @returns {boolean}
   */
  function canManageDatabase(requesterUsername) {
    return canRunArchiveManually(requesterUsername);
  }

  return {
    getActiveUserRole,
    canManageArchiveSession,
    canRunArchiveManually,
    canManageDatabase
  };
}

module.exports = {
  createDbAccessControlService
};
