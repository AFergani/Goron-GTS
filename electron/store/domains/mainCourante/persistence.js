/**
 * Accès PostgreSQL du domaine Main courante.
 *
 * Consommé par `entries.js`. Même pool que les référentiels (`getReferentialsPersistence`).
 *
 * @module electron/store/domains/mainCourante/persistence
 */

/**
 * Exige une persistance PostgreSQL ouverte pour la main courante.
 *
 * @param {import('../../../userStore')} store
 * @param {string} [source="mainCourante"]
 * @returns {import('../../persistence/persistenceContract').PersistenceAdapter}
 */
function requireMainCourantePersistence(store, source = "mainCourante") {
  if (!store || typeof store !== "object") {
    throw new Error("Store Main courante non initialisé.");
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
        "Base PostgreSQL inaccessible. La main courante est indisponible tant que le serveur n'est pas disponible.",
        "PG_UNAVAILABLE"
      );
    }
    throw new Error("Base PostgreSQL inaccessible. La main courante est indisponible tant que le serveur n'est pas disponible.");
  }

  return db;
}

module.exports = { requireMainCourantePersistence };
