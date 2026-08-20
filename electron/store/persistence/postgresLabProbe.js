/**
 * Sonde d'accessibilité PostgreSQL (`SELECT 1` sur un client court, hors pool applicatif).
 *
 * Sert au badge sidebar « DB », au monitoring des transitions, et au test admin
 * (brouillon de connexion, sans toucher au pool).
 *
 * @module electron/store/persistence/postgresLabProbe
 */

const { Client } = require("pg");
const { getPostgresConnectionConfig } = require("./postgresConnectionConfig");

/**
 * @typedef {{
 *   reachable: boolean,
 *   engine: "postgres",
 *   host: string,
 *   port: number,
 *   database: string,
 *   error: string|null,
 *   checkedAt: string
 * }} PostgresProbeResult
 */

/**
 * Fusionne un brouillon UI avec la config résolue du poste.
 *
 * @param {object} [overrides]
 * @returns {{ host: string, port: number, database: string, user: string, password: string, connectionTimeoutMillis: number }}
 */
function resolveProbeConfig(overrides = {}) {
  const base = getPostgresConnectionConfig();
  const text = (key) => {
    const raw = overrides[key] != null ? overrides[key] : base[key];
    const value = String(raw ?? "").trim();
    return value || base[key];
  };
  return {
    host: text("host"),
    port: Number(overrides.port != null ? overrides.port : base.port) || base.port,
    database: text("database"),
    user: text("user"),
    password:
      overrides.password != null && String(overrides.password) !== ""
        ? String(overrides.password)
        : base.password,
    connectionTimeoutMillis: base.connectionTimeoutMillis
  };
}

/**
 * Teste si le serveur PostgreSQL répond (`SELECT 1`).
 *
 * @param {object} [overrides] - Brouillon UI ; sinon config résolue du poste.
 * @param {string} [overrides.host]
 * @param {number|string} [overrides.port]
 * @param {string} [overrides.database]
 * @param {string} [overrides.user]
 * @param {string} [overrides.password] - Vide = mot de passe déjà stocké.
 * @returns {Promise<PostgresProbeResult>}
 */
async function probePostgresLab(overrides = {}) {
  const cfg = resolveProbeConfig(overrides);
  const checkedAt = new Date().toISOString();
  const client = new Client(cfg);

  /**
   * @param {boolean} reachable
   * @param {string|null} error
   * @returns {PostgresProbeResult}
   */
  function toResult(reachable, error) {
    return {
      reachable,
      engine: "postgres",
      host: cfg.host,
      port: cfg.port,
      database: cfg.database,
      error,
      checkedAt
    };
  }

  try {
    await client.connect();
    await client.query("SELECT 1 AS ok");
    return toResult(true, null);
  } catch (error) {
    const message = error instanceof Error && error.message
      ? error.message
      : "Connexion PostgreSQL impossible.";
    return toResult(false, message);
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
