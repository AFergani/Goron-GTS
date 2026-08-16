/**
 * Fabrique des adaptateurs de persistance Goron-GTS (PostgreSQL only).
 *
 * Point d'entrée pour ouvrir / sonder PostgreSQL, le routeur d'audit et le journal
 * local des événements PG (`gts-pg-events.log`).
 *
 * @module electron/store/persistence
 */

const { createPostgresPersistence } = require("./postgresPersistence");
const { applyPostgresMigrations } = require("./postgresMigrations");
const { getPostgresLabConfig } = require("./postgresLabConfig");
const {
  getPostgresConnectionConfig,
  getPublicPostgresConnectionConfig
} = require("./postgresConnectionConfig");
const { createAuditPersistenceRouter } = require("./auditPersistence");
const {
  appendPostgresEvent,
  readPostgresEvents,
  resolvePostgresEventLogPath
} = require("./postgresEventLog");

/**
 * Ouvre un adaptateur PostgreSQL (labo) et applique le schéma SQL.
 *
 * @param {object} [config] - Surcharge de `getPostgresLabConfig()` ; omis = config labo.
 * @param {(error: unknown) => void} [config.onIdleClientError]
 * @returns {Promise<import('./persistenceContract').PersistenceAdapter>}
 */
async function openPostgresPersistence(config) {
  const cfg = { ...getPostgresLabConfig(), ...(config || {}) };
  const adapter = createPostgresPersistence(cfg);
  await adapter.open();
  await applyPostgresMigrations(adapter);
  return adapter;
}

/**
 * Tente d'ouvrir PostgreSQL labo ; retourne `null` si injoignable (pas d'exception).
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

/**
 * Ouvre un adaptateur PostgreSQL (seule option supportée).
 *
 * @param {object} [options]
 * @param {object} [options.postgres] - Config PG.
 * @returns {Promise<import('./persistenceContract').PersistenceAdapter>}
 */
async function openPersistence(options = {}) {
  const engine = String(options.engine || "postgres").toLowerCase();
  if (engine === "postgres") {
    return openPostgresPersistence(options.postgres);
  }
  throw new Error(`Moteur de persistance non supporté: ${engine} (PostgreSQL uniquement).`);
}

module.exports = {
  openPersistence,
  openPostgresPersistence,
  tryOpenPostgresLabPersistence,
  createPostgresPersistence,
  createAuditPersistenceRouter,
  applyPostgresMigrations,
  appendPostgresEvent,
  readPostgresEvents,
  resolvePostgresEventLogPath,
  probePostgresLab: require("./postgresLabProbe").probePostgresLab,
  probePostgresLabMonitored: require("./postgresLabMonitor").probePostgresLabMonitored,
  resetPostgresLabMonitor: require("./postgresLabMonitor").resetPostgresLabMonitor,
  getPostgresLabConfig,
  getPostgresConnectionConfig,
  getPublicPostgresConnectionConfig
};
