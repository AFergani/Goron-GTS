/**
 * Accès PostgreSQL partagé du périmètre Fransor (page + responsables Paramètres).
 *
 * @module electron/store/domains/fransor/persistence
 */

/**
 * Exige PostgreSQL joignable (même pool labo que les référentiels).
 *
 * @param {import('../../../userStore')} store
 * @param {string} [source] - Préfixe d'erreur (ex. `fransor:closures`).
 * @returns {import('../../persistence/persistenceContract').PersistenceAdapter}
 */
function requireFransorPersistence(store, source = "fransor") {
  if (typeof store.assertPostgresAvailableForReferentials === "function") {
    store.assertPostgresAvailableForReferentials();
  }
  const refDb =
    typeof store.getReferentialsPersistence === "function" ? store.getReferentialsPersistence() : null;
  if (!refDb) {
    store.fail(
      source,
      "Base PostgreSQL inaccessible. Le module Fransor (responsables, exceptions, accompagnements) est indisponible tant que le serveur n'est pas disponible.",
      "PG_UNAVAILABLE"
    );
  }
  return refDb;
}

module.exports = {
  requireFransorPersistence
};
