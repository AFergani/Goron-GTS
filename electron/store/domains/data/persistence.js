/**
 * Accès PostgreSQL du domaine Gestion des données (référentiels et files d'attente).
 *
 * Consommé par `pendingSites.js`, `pendingIntervenants.js`, `pendingPropagate.js`.
 *
 * @module electron/store/domains/data/persistence
 */

/**
 * Exige une persistance PostgreSQL ouverte.
 *
 * @param {import('../../../userStore')} store
 * @param {string} [source="data"]
 * @returns {import('../../persistence/persistenceContract').PersistenceAdapter}
 */
function requireDataPersistence(store, source = "data") {
  if (!store || typeof store !== "object") {
    throw new Error("Store de données non initialisé.");
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
        "Base PostgreSQL inaccessible. Les référentiels et propositions en attente sont indisponibles tant que le serveur n'est pas disponible.",
        "PG_UNAVAILABLE"
      );
    }
    throw new Error("Base PostgreSQL inaccessible. Les référentiels et propositions en attente sont indisponibles tant que le serveur n'est pas disponible.");
  }

  return db;
}

module.exports = { requireDataPersistence };
