/**
 * Sonde d'accessibilité PostgreSQL (`SELECT 1`).
 *
 * Sert au badge sidebar « DB » et au monitoring des transitions (perte / reconnexion).
 *
 * @module electron/store/persistence/postgresLabProbe
 */

const { Client } = require("pg");
const { getPostgresLabConfig } = require("./postgresLabConfig");

/**
 * Teste si le serveur PostgreSQL labo répond (`SELECT 1`).
 *
 * @returns {Promise<{ reachable: boolean, engine: "postgres", host: string, port: number, database: string, error: string|null, checkedAt: string }>}
 */
async function probePostgresLab() {
  const cfg = getPostgresLabConfig();
  const checkedAt = new Date().toISOString();
  const client = new Client({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    connectionTimeoutMillis: cfg.connectionTimeoutMillis
  });

  try {
    await client.connect();
    await client.query("SELECT 1 AS ok");
    return {
      reachable: true,
      engine: "postgres",
      host: cfg.host,
      port: cfg.port,
      database: cfg.database,
      error: null,
      checkedAt
    };
  } catch (error) {
    const message = error && typeof error === "object" && "message" in error ? String(error.message) : "Connexion PostgreSQL impossible.";
    return {
      reachable: false,
      engine: "postgres",
      host: cfg.host,
      port: cfg.port,
      database: cfg.database,
      error: message,
      checkedAt
    };
  } finally {
    try {
      await client.end();
    } catch {
      // Ignore la fermeture si la connexion n'a jamais abouti.
    }
  }
}

module.exports = {
  probePostgresLab
};
