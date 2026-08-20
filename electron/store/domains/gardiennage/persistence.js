/**
 * Accès PostgreSQL du domaine Gardiennage.
 *
 * Même pool que les référentiels (`getReferentialsPersistence`).
 * Consommé par `entries.js`, `entriesLifecycle.js`, `autoClose.js`, `openEndedHorizon.js`.
 *
 * @module electron/store/domains/gardiennage/persistence
 */

/**
 * Exige une persistance PostgreSQL ouverte.
 *
 * @param {import('../../../userStore')} store
 * @param {string} [source="gardiennage"] - Préfixe d'erreur (ex. `gardiennage:create`).
 * @returns {import('../../persistence/persistenceContract').PersistenceAdapter}
 */
function requireGardiennagePersistence(store, source = "gardiennage") {
  if (!store || typeof store !== "object") {
    throw new Error("Store Gardiennage non initialisé.");
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
        "Base PostgreSQL inaccessible. Les gardiennages sont indisponibles tant que le serveur n'est pas disponible.",
        "PG_UNAVAILABLE"
      );
    }
    throw new Error("Base PostgreSQL inaccessible. Les gardiennages sont indisponibles tant que le serveur n'est pas disponible.");
  }

  return db;
}

module.exports = { requireGardiennagePersistence };
