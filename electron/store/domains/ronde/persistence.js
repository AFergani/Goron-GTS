/**
 * Accès PostgreSQL exclusif du domaine Rondes.
 *
 * @module electron/store/domains/ronde/persistence
 */

/**
 * Exige une persistance PostgreSQL ouverte.
 *
 * @param {import('../../../userStore')} store
 * @param {string} [source="ronde"]
 * @returns {import('../../persistence/persistenceContract').PersistenceAdapter}
 */
function requireRondePersistence(store, source = "ronde") {
  if (typeof store.assertPostgresAvailableForReferentials === "function") {
    store.assertPostgresAvailableForReferentials();
  }
  const db = typeof store.getReferentialsPersistence === "function"
    ? store.getReferentialsPersistence()
    : null;
  if (!db || db.engine !== "postgres" || !db.isOpen()) {
    store.fail(
      source,
      "Base PostgreSQL inaccessible. Les rondes sont indisponibles tant que le serveur n'est pas disponible.",
      "PG_UNAVAILABLE"
    );
  }
  return db;
}

module.exports = { requireRondePersistence };
