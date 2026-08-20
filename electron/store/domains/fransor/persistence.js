/**
 * Accès PostgreSQL partagé du périmètre Fransor (page + responsables Paramètres).
 *
 * Même pool que les référentiels (`getReferentialsPersistence`).
 * Consommé par `responsables.js`, `closures.js`, `accompagnements.js`.
 *
 * @module electron/store/domains/fransor/persistence
 */

/**
 * Exige une persistance PostgreSQL ouverte.
 *
 * @param {import('../../../userStore')} store
 * @param {string} [source="fransor"] - Préfixe d'erreur (ex. `fransor:closures:upsert`).
 * @returns {import('../../persistence/persistenceContract').PersistenceAdapter}
 */
function requireFransorPersistence(store, source = "fransor") {
  if (!store || typeof store !== "object") {
    throw new Error("Store Fransor non initialisé.");
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
        "Base PostgreSQL inaccessible. Le module Fransor (responsables, exceptions, accompagnements) est indisponible tant que le serveur n'est pas disponible.",
        "PG_UNAVAILABLE"
      );
    }
    throw new Error("Base PostgreSQL inaccessible. Le module Fransor (responsables, exceptions, accompagnements) est indisponible tant que le serveur n'est pas disponible.");
  }

  return db;
}

module.exports = {
  requireFransorPersistence
};
