/**
 * Accès PostgreSQL du domaine Gardiennage.
 *
 * @module electron/store/domains/gardiennage/persistence
 */

/**
 * Exige une persistance PostgreSQL ouverte pour les gardiennages.
 *
 * @param {import('../../../userStore')} store
 * @param {string} [source="gardiennage"]
 * @returns {import('../../persistence/persistenceContract').PersistenceAdapter}
 */
function requireGardiennagePersistence(store, source = "gardiennage") {
  if (typeof store.assertPostgresAvailableForReferentials === "function") {
    store.assertPostgresAvailableForReferentials();
  }
  const db = typeof store.getReferentialsPersistence === "function"
    ? store.getReferentialsPersistence()
    : null;
  if (!db || db.engine !== "postgres" || !db.isOpen()) {
    store.fail(
      source,
      "Base PostgreSQL inaccessible. Les gardiennages sont indisponibles tant que le serveur n'est pas disponible.",
      "PG_UNAVAILABLE"
    );
  }
  return db;
}

module.exports = { requireGardiennagePersistence };
