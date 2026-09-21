/**
 * Accès PostgreSQL partagé du périmètre Fransor (page + responsables Paramètres).
 *
 * Même pool que les référentiels (`getReferentialsPersistence`).
 * Consommé par `responsables.js`, `closures.js`, `accompagnements.js`.
 *
 * @module electron/store/domains/fransor/persistence
 */

const { requirePostgresPersistence } = require("../../persistence/requirePostgres");

/**
 * Exige une persistance PostgreSQL ouverte.
 *
 * @param {import('../../../userStore')} store
 * @param {string} [source="fransor"] - Préfixe d'erreur (ex. `fransor:closures:upsert`).
 * @returns {import('../../persistence/persistenceContract').PersistenceAdapter}
 */
function requireFransorPersistence(store, source = "fransor") {
  return requirePostgresPersistence(store, {
    storeLabel: "Store Fransor",
    source,
    unavailableMessage:
      "Base PostgreSQL inaccessible. Le module Fransor (responsables, exceptions, accompagnements) est indisponible tant que le serveur n'est pas disponible."
  });
}

module.exports = { requireFransorPersistence };
