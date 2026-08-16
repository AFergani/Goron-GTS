/**
 * Accès PostgreSQL du domaine Intervention.
 *
 * @module electron/store/domains/intervention/persistence
 */

/**
 * Exige une persistance PostgreSQL ouverte pour les interventions.
 *
 * @param {import('../../../userStore')} store
 * @param {string} [source]
 * @returns {import('../../persistence/persistenceContract').PersistenceAdapter}
 */
function requireInterventionPersistence(store, source = "intervention") {
  if (typeof store.assertPostgresAvailableForReferentials === "function") {
    store.assertPostgresAvailableForReferentials();
  }
  const db = typeof store.getReferentialsPersistence === "function" ? store.getReferentialsPersistence() : null;
  if (!db || db.engine !== "postgres" || !db.isOpen()) {
    store.fail(
      source,
      "Base PostgreSQL inaccessible. Les interventions sont indisponibles tant que le serveur n'est pas disponible.",
      "PG_UNAVAILABLE"
    );
  }
  return db;
}

module.exports = { requireInterventionPersistence };
