/**
 * Accès PostgreSQL du domaine Gestion des données (référentiels et files d'attente).
 *
 * Consommé par `pendingSites.js`, `pendingIntervenants.js`, `pendingPropagate.js`.
 *
 * @module electron/store/domains/data/persistence
 */

const { requirePostgresPersistence } = require("../../persistence/requirePostgres");

/**
 * Exige une persistance PostgreSQL ouverte.
 *
 * @param {import('../../../userStore')} store
 * @param {string} [source="data"]
 * @returns {import('../../persistence/persistenceContract').PersistenceAdapter}
 */
function requireDataPersistence(store, source = "data") {
  return requirePostgresPersistence(store, {
    storeLabel: "Store de données",
    source,
    unavailableMessage:
      "Base PostgreSQL inaccessible. Les référentiels et propositions en attente sont indisponibles tant que le serveur n'est pas disponible."
  });
}

module.exports = { requireDataPersistence };
