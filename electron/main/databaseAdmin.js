/**
 * Administration locale minimale du poste (boot / badge config).
 *
 * Plus de chemin SQLite : le métier court sur PostgreSQL. `configured` indique
 * que le store applicatif est prêt (toujours vrai après démarrage réussi).
 *
 * Instancié dans `main.js` ; exposé au renderer via `ipcSystemHandlers.js`
 * (`system:getDbConfig`) et `gtsApiClient` / écran de connexion.
 */

/**
 * Fabrique le service d'administration locale du poste.
 *
 * @param {object} deps - Dépendances injectées par `main.js`.
 * @param {boolean} deps.isDev - Indique si le profil développement est actif.
 * @param {() => boolean} deps.isStoreReady - `true` si `UserStore` est instancié.
 * @returns {{
 *   getDbConfig: () => { configured: boolean, dbPath: string|null, isDev: boolean }
 * }}
 */
function createDatabaseAdminService(deps) {
  const { isDev, isStoreReady } = deps;

  /**
   * Retourne l'état de configuration du poste (plus de fichier `.db`).
   *
   * `dbPath` reste exposé à `null` pour compatibilité IPC / UI (ne plus l'afficher).
   *
   * @returns {{ configured: boolean, dbPath: string|null, isDev: boolean }}
   */
  function getDbConfig() {
    return {
      configured: Boolean(isStoreReady()),
      dbPath: null,
      isDev
    };
  }

  return {
    getDbConfig
  };
}

module.exports = {
  createDatabaseAdminService
};
