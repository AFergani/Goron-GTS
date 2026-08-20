/**
 * Point d'entrée persistance PostgreSQL : ouverture du pool + schéma,
 * routeur d'audit, sonde surveillée (badge DB).
 *
 * Les autres modules (`postgresConnectionConfig`, journal d'événements, sonde
 * brute) s'importent directement depuis leur fichier.
 *
 * @module electron/store/persistence
 */

const { createPostgresPersistence } = require("./postgresPersistence");
const { applyPostgresMigrations } = require("./postgresMigrations");
const { getPostgresConnectionConfig } = require("./postgresConnectionConfig");
const { createAuditPersistenceRouter } = require("./auditPersistence");
const { probePostgresLabMonitored } = require("./postgresLabMonitor");

/**
 * Ouvre un adaptateur PostgreSQL et applique le schéma SQL.
 *
 * @param {object} [config] - Surcharge de `getPostgresConnectionConfig()` ; omis = config résolue.
 * @param {(error: unknown) => void} [config.onIdleClientError]
 * @returns {Promise<import('./persistenceContract').PersistenceAdapter>}
 */
async function openPostgresPersistence(config) {
  const cfg = { ...getPostgresConnectionConfig(), ...(config || {}) };
  const adapter = createPostgresPersistence(cfg);
  await adapter.open();
  await applyPostgresMigrations(adapter);
  return adapter;
}

/**
 * Tente d'ouvrir PostgreSQL ; retourne `null` si injoignable (pas d'exception).
 *
 * @param {object} [config] - Surcharge optionnelle (ex. `onIdleClientError`).
 * @returns {Promise<import('./persistenceContract').PersistenceAdapter|null>}
 */
async function tryOpenPostgresLabPersistence(config) {
  try {
    return await openPostgresPersistence(config);
  } catch {
    return null;
  }
}

module.exports = {
  tryOpenPostgresLabPersistence,
  createAuditPersistenceRouter,
  probePostgresLabMonitored
};
