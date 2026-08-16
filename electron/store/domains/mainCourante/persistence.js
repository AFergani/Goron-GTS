/**
 * Accès PostgreSQL du domaine Main courante.
 *
 * @module electron/store/domains/mainCourante/persistence
 */

/**
 * Exige PostgreSQL joignable (même pool labo que les référentiels / Fransor).
 *
 * @param {import('../../../userStore')} store
 * @param {string} [source]
 * @returns {import('../../persistence/persistenceContract').PersistenceAdapter}
 */
function requireMainCourantePersistence(store, source = "mainCourante") {
  if (typeof store.assertPostgresAvailableForReferentials === "function") {
    store.assertPostgresAvailableForReferentials();
  }
  const refDb =
    typeof store.getReferentialsPersistence === "function" ? store.getReferentialsPersistence() : null;
  if (!refDb) {
    store.fail(
      source,
      "Base PostgreSQL inaccessible. La main courante est indisponible tant que le serveur n'est pas disponible.",
      "PG_UNAVAILABLE"
    );
  }
  return refDb;
}

module.exports = {
  requireMainCourantePersistence
};
