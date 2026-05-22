/**
 * Contrôles d'accès RBAC liés à la base SQLite et aux opérations sensibles (archives, bascule de base).
 * Interroge la table `users` du store actif ; replis à `false` / `null` si la BDD n'est pas prête.
 *
 * Instancié tôt dans `main.js` (`createDbAccessControlService`) et réinjecté dans `databaseAdmin.js`
 * ainsi que `ipcSystemHandlers.js` (archivage manuel, paramètres base).
 */

/**
 * Fabrique les vérifications de droits basées sur le rôle et le profil manager en base.
 *
 * @param {object} deps
 * @param {() => import('../userStore')|null} deps.getUserStore - Store SQLite courant ; `null` ou sans `db` si non configuré.
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
   * Retourne le rôle applicatif (`DEV`, `RESPONSABLE`, `OPERATEUR`, etc.) d'un utilisateur actif.
   *
   * Utilisé notamment par `databaseAdmin.switchActiveDatabase` pour autoriser un `DEV` à lever
   * le verrou d'une session archive ouverte par un autre compte.
   *
   * @param {string} username - Identifiant de connexion (comparaison insensible à la casse).
   * @returns {string|null} Valeur de `users.role` ou `null` si utilisateur inconnu, inactif ou BDD absente.
   */
  function getActiveUserRole(username) {
    const userStore = getUserStore();
    if (!userStore?.db) return null;
    const row = userStore.db
      .prepare("SELECT role FROM users WHERE lower(username) = ? AND is_active = 1 LIMIT 1")
      .get(String(username || "").trim().toLowerCase());
    return row?.role || null;
  }

  /**
   * Indique si l'utilisateur peut ouvrir une base depuis le dossier Archives (session archive).
   *
   * Plus permissif que `canManageDatabase` : tout compte `RESPONSABLE` ou `DEV` actif suffit,
   * sans filtre sur `manager_profile`.
   *
   * @param {string} requesterUsername - Demandeur de la bascule archive.
   * @returns {boolean} `true` si rôle `RESPONSABLE` ou `DEV` ; sinon `false` (y compris BDD non prête).
   */
  function canManageArchiveSession(requesterUsername) {
    const userStore = getUserStore();
    if (!userStore?.db) return false;
    const row = userStore.db
      .prepare("SELECT role FROM users WHERE lower(username) = ? AND is_active = 1 LIMIT 1")
      .get(String(requesterUsername || "").trim().toLowerCase());
    return Boolean(row && (row.role === "RESPONSABLE" || row.role === "DEV"));
  }

  /**
   * Indique si l'utilisateur peut lancer un archivage manuel depuis Paramètres (`system:runArchiveNow`).
   *
   * Règles : `DEV` toujours autorisé ; sinon `RESPONSABLE` avec `manager_profile` directeur ou responsable de station.
   *
   * @param {string} requesterUsername - Utilisateur authentifié côté IPC.
   * @returns {boolean}
   */
  function canRunArchiveManually(requesterUsername) {
    const userStore = getUserStore();
    if (!userStore?.db) return false;
    const row = userStore.db
      .prepare("SELECT role, manager_profile FROM users WHERE lower(username) = ? AND is_active = 1 LIMIT 1")
      .get(String(requesterUsername || "").trim().toLowerCase());
    if (!row) return false;
    if (row.role === "DEV") return true;
    if (row.role !== "RESPONSABLE") return false;
    return row.manager_profile === "DIRECTEUR_STATION" || row.manager_profile === "RESPONSABLE_STATION";
  }

  /**
   * Indique si l'utilisateur peut changer la base active (`system:switchDatabase` / Paramètres données).
   *
   * Mêmes critères que `canRunArchiveManually` : directeur ou responsable de station, ou profil `DEV`.
   *
   * @param {string} requesterUsername - Utilisateur authentifié.
   * @returns {boolean}
   */
  function canManageDatabase(requesterUsername) {
    const userStore = getUserStore();
    if (!userStore?.db) return false;
    const row = userStore.db
      .prepare("SELECT role, manager_profile FROM users WHERE lower(username) = ? AND is_active = 1 LIMIT 1")
      .get(String(requesterUsername || "").trim().toLowerCase());
    if (!row) return false;
    if (row.role === "DEV") return true;
    if (row.role !== "RESPONSABLE") return false;
    return row.manager_profile === "DIRECTEUR_STATION" || row.manager_profile === "RESPONSABLE_STATION";
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
