/**
 * Diagnostic de joignabilité PostgreSQL pour le badge / IPC `system:getDbHealth`.
 *
 * Le signal reflète uniquement l’état du pool référentiels actif du `UserStore`.
 * Aucune compatibilité SQLite ni ancien chemin de secours n'est conservé ici.
 *
 * @module electron/store/domains/dbHealth
 */

/**
 * État santé base côté orchestrateur (PostgreSQL seulement).
 *
 * @param {import('../userStore')} store
 * @returns {{ configured: boolean, writable: boolean }}
 */
function getDbHealth(store) {
  if (!store || typeof store.getReferentialsPersistence !== "function") {
    return { configured: true, writable: false };
  }

  const db = store.getReferentialsPersistence();
  const writable = Boolean(db && typeof db.isOpen === "function" && db.isOpen());

  return { configured: true, writable };
}

module.exports = {
  getDbHealth
};
