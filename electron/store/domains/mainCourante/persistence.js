/**
 * Accès PostgreSQL du domaine Main courante.
 *
 * Consommé par `entries.js`. Même pool que les référentiels (`getReferentialsPersistence`).
 *
 * @module electron/store/domains/mainCourante/persistence
 */

const { requirePostgresPersistence } = require("../../persistence/requirePostgres");

/**
 * Exige une persistance PostgreSQL ouverte pour la main courante.
 *
 * @param {import('../../../userStore')} store
 * @param {string} [source="mainCourante"]
 * @returns {import('../../persistence/persistenceContract').PersistenceAdapter}
 */
function requireMainCourantePersistence(store, source = "mainCourante") {
  return requirePostgresPersistence(store, {
    storeLabel: "Store Main courante",
    source,
    unavailableMessage:
      "Base PostgreSQL inaccessible. La main courante est indisponible tant que le serveur n'est pas disponible."
  });
}

module.exports = { requireMainCourantePersistence };
