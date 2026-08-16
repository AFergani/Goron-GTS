/**
 * Configuration PostgreSQL résolue pour le driver `pg` (labo + admin chiffré).
 *
 * Délègue à `postgresConnectionConfig` : env `GTS_PG_*` > fichier chiffré > défauts Docker labo.
 * Conservé pour compatibilité des imports existants (`getPostgresLabConfig`).
 *
 * @module electron/store/persistence/postgresLabConfig
 */

const { getPostgresConnectionConfig } = require("./postgresConnectionConfig");

/** @typedef {import('./postgresConnectionConfig').PostgresConnectionConfig} PostgresLabConfig */

/**
 * Paramètres de connexion PostgreSQL (pool / sonde).
 *
 * @returns {{ host: string, port: number, database: string, user: string, password: string, connectionTimeoutMillis: number }}
 */
function getPostgresLabConfig() {
  const cfg = getPostgresConnectionConfig();
  return {
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    connectionTimeoutMillis: cfg.connectionTimeoutMillis
  };
}

module.exports = {
  getPostgresLabConfig
};
