/**
 * Accès PostgreSQL du domaine Main courante.
 *
 * Ce module ne supporte que la persistance PostgreSQL active du store.
 * Aucun chemin SQLite ni ancien adaptateur de secours n'est maintenu.
 *
 * @module electron/store/domains/mainCourante/persistence
 */

/**
 * Exige PostgreSQL joignable (même pool labo que les référentiels / Fransor).
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

  const refDb = typeof store.getReferentialsPersistence === "function"
    ? store.getReferentialsPersistence()
    : null;

  if (!refDb || refDb.engine !== "postgres" || typeof refDb.isOpen !== "function" || !refDb.isOpen()) {
    if (typeof store.fail === "function") {
      store.fail(
        source,
        "Base PostgreSQL inaccessible. La main courante est indisponible tant que le serveur n'est pas disponible.",
        "PG_UNAVAILABLE"
      );
    }
    throw new Error("Base PostgreSQL inaccessible. La main courante est indisponible tant que le serveur n'est pas disponible.");
  }

  return refDb;
}

module.exports = {
  requireMainCourantePersistence
};
