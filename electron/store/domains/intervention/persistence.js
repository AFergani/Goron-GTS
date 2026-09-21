/**
 * Accès PostgreSQL du domaine Intervention.
 *
 * @module electron/store/domains/intervention/persistence
 */

const { requirePostgresPersistence } = require("../../persistence/requirePostgres");

/**
 * Exige une persistance PostgreSQL ouverte pour les interventions.
 *
 * @param {import('../../../userStore')} store
 * @param {string} [source="intervention"]
 * @returns {import('../../persistence/persistenceContract').PersistenceAdapter}
 */
function requireInterventionPersistence(store, source = "intervention") {
  return requirePostgresPersistence(store, {
    storeLabel: "Store d'intervention",
    source,
    unavailableMessage:
      "Base PostgreSQL inaccessible. Les interventions sont indisponibles tant que le serveur n'est pas disponible."
  });
}

module.exports = { requireInterventionPersistence };
