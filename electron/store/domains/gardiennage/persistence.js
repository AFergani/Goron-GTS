/**
 * Accès PostgreSQL du domaine Gardiennage.
 *
 * Même pool que les référentiels (`getReferentialsPersistence`).
 * Consommé par `entries.js`, `entriesLifecycle.js`, `autoClose.js`, `openEndedHorizon.js`.
 *
 * @module electron/store/domains/gardiennage/persistence
 */

const { requirePostgresPersistence } = require("../../persistence/requirePostgres");

/**
 * Exige une persistance PostgreSQL ouverte.
 *
 * @param {import('../../../userStore')} store
 * @param {string} [source="gardiennage"] - Préfixe d'erreur (ex. `gardiennage:create`).
 * @returns {import('../../persistence/persistenceContract').PersistenceAdapter}
 */
function requireGardiennagePersistence(store, source = "gardiennage") {
  return requirePostgresPersistence(store, {
    storeLabel: "Store Gardiennage",
    source,
    unavailableMessage:
      "Base PostgreSQL inaccessible. Les gardiennages sont indisponibles tant que le serveur n'est pas disponible."
  });
}

module.exports = { requireGardiennagePersistence };
