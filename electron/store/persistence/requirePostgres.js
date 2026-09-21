/**
 * Exige une persistance PostgreSQL ouverte (pool référentiels).
 *
 * Facteur commun des `require*Persistence` de domaine : même pool, même contrôle
 * `engine === "postgres"`, seul le libellé d’erreur change.
 *
 * @module electron/store/persistence/requirePostgres
 */

/**
 * @param {object} store - UserStore (assertPostgres + getReferentialsPersistence + fail)
 * @param {{ storeLabel: string, source: string, unavailableMessage: string }} options
 * @returns {import('./persistenceContract').PersistenceAdapter}
 */
function requirePostgresPersistence(store, options) {
  const storeLabel = options.storeLabel;
  const source = options.source;
  const unavailableMessage = options.unavailableMessage;

  if (!store || typeof store !== "object") {
    throw new Error(`${storeLabel} non initialisé.`);
  }

  if (typeof store.assertPostgresAvailableForReferentials === "function") {
    store.assertPostgresAvailableForReferentials();
  }

  const db =
    typeof store.getReferentialsPersistence === "function" ? store.getReferentialsPersistence() : null;

  if (!db || db.engine !== "postgres" || typeof db.isOpen !== "function" || !db.isOpen()) {
    if (typeof store.fail === "function") {
      store.fail(source, unavailableMessage, "PG_UNAVAILABLE");
    }
    throw new Error(unavailableMessage);
  }

  return db;
}

module.exports = { requirePostgresPersistence };
