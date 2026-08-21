/**
 * Accès PostgreSQL du domaine Rondes.
 *
 * Consommé par `entries.js`, `plannedProfiles.js`, `autoClose.js`.
 *
 * @module electron/store/domains/ronde/persistence
 */

/**
 * Exige une persistance PostgreSQL ouverte pour les rondes.
 *
 * @param {import('../../../userStore')} store
 * @param {string} [source="ronde"]
 * @returns {import('../../persistence/persistenceContract').PersistenceAdapter}
 */
function requireRondePersistence(store, source = "ronde") {
  if (!store || typeof store !== "object") {
    throw new Error("Store Rondes non initialisé.");
  }

  if (typeof store.assertPostgresAvailableForReferentials === "function") {
    store.assertPostgresAvailableForReferentials();
  }

  const db = typeof store.getReferentialsPersistence === "function"
    ? store.getReferentialsPersistence()
    : null;

  if (!db || db.engine !== "postgres" || typeof db.isOpen !== "function" || !db.isOpen()) {
    if (typeof store.fail === "function") {
      store.fail(
        source,
        "Base PostgreSQL inaccessible. Les rondes sont indisponibles tant que le serveur n'est pas disponible.",
        "PG_UNAVAILABLE"
      );
    }
    throw new Error("Base PostgreSQL inaccessible. Les rondes sont indisponibles tant que le serveur n'est pas disponible.");
  }

  return db;
}

module.exports = { requireRondePersistence };
