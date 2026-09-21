/**
 * Accès PostgreSQL du domaine Rondes.
 *
 * Consommé par `entries.js`, `plannedProfiles.js`, `autoClose.js`.
 *
 * @module electron/store/domains/ronde/persistence
 */

const { requirePostgresPersistence } = require("../../persistence/requirePostgres");

/**
 * Exige une persistance PostgreSQL ouverte pour les rondes.
 *
 * @param {import('../../../userStore')} store
 * @param {string} [source="ronde"]
 * @returns {import('../../persistence/persistenceContract').PersistenceAdapter}
 */
function requireRondePersistence(store, source = "ronde") {
  return requirePostgresPersistence(store, {
    storeLabel: "Store Rondes",
    source,
    unavailableMessage:
      "Base PostgreSQL inaccessible. Les rondes sont indisponibles tant que le serveur n'est pas disponible."
  });
}

module.exports = { requireRondePersistence };
