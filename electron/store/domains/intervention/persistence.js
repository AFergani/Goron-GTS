/**
 * Accès PostgreSQL du domaine Intervention.
 *
 * @module electron/store/domains/intervention/persistence
 */

/**
 * Exige une persistance PostgreSQL ouverte pour les interventions.
 *
 * @param {import('../../../userStore')} store
 * @param {string} [source="intervention"]
 * @returns {import('../../persistence/persistenceContract').PersistenceAdapter}
 */
function requireInterventionPersistence(store, source = "intervention") {
  if (!store || typeof store !== "object") {
    throw new Error("Store d'intervention non initialisé.");
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
        "Base PostgreSQL inaccessible. Les interventions sont indisponibles tant que le serveur n'est pas disponible.",
        "PG_UNAVAILABLE"
      );
    }
    throw new Error("Base PostgreSQL inaccessible. Les interventions sont indisponibles tant que le serveur n'est pas disponible.");
  }

  return db;
}

module.exports = { requireInterventionPersistence };
