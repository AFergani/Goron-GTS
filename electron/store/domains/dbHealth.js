/**
 * Diagnostic de joignabilité PostgreSQL pour le badge / IPC `system:getDbHealth`.
 *
 * Indique si le pool référentiels est branché (pas de probe d'écriture SQLite).
 * Ne remplace pas la sonde réseau labo (`postgresLabMonitor`) : reflète seulement
 * si `UserStore` a un adaptateur PG actif pour les domaines métier.
 */

/**
 * État santé base côté orchestrateur (PostgreSQL only).
 *
 * @param {import('../userStore')} store
 * @returns {{ configured: boolean, writable: boolean }}
 */
function getDbHealth(store) {
  const writable = Boolean(
    store.getReferentialsPersistence && store.getReferentialsPersistence()
  );
  return { configured: true, writable };
}

module.exports = {
  getDbHealth
};
