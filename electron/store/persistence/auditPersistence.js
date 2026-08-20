/**
 * Routeur d'écriture `audit_logs` (PostgreSQL only).
 *
 * - écriture via `writeAudit` si le pool est joignable ;
 * - si PG down : no-op soft (`{ written: false }`) ;
 * - lecture : `getActive()` (adaptateur ou `null`) pour `UserStore.getAuditPersistence()`.
 *
 * La perte / reconnexion PG se journalise dans `gts-pg-events.log` (`postgresLabMonitor`).
 *
 * @module electron/store/persistence/auditPersistence
 */

const { writeAudit } = require("../core/audit");

/**
 * @typedef {object} AuditPersistenceRouter
 * @property {() => import('./persistenceContract').PersistenceAdapter|null} getActive
 * @property {() => "postgres"|"none"} getEngine
 * @property {(reachable: boolean) => void} setPostgresReachable
 * @property {(entry: object) => Promise<{ written: boolean }>} write
 */

/**
 * Indique une panne de connexion (pas une erreur SQL métier).
 *
 * @param {unknown} error
 * @returns {boolean}
 */
function isPostgresConnectivityError(error) {
  const code = String(error && typeof error === "object" && "code" in error ? error.code : "").toUpperCase();
  if (
    [
      "57P01",
      "57P02",
      "57P03",
      "08000",
      "08001",
      "08003",
      "08006",
      "ECONNREFUSED",
      "ENOTFOUND",
      "ETIMEDOUT",
      "ECONNRESET"
    ].includes(code)
  ) {
    return true;
  }
  const message = (error instanceof Error ? error.message : String(error || "")).toLowerCase();
  return (
    message.includes("connection terminated") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("timeout") ||
    message.includes("adaptateur de persistance indisponible")
  );
}

/**
 * Crée un routeur audit (PG only).
 *
 * @param {object} options
 * @param {import('./persistenceContract').PersistenceAdapter|null} [options.postgresPersistence]
 * @returns {AuditPersistenceRouter}
 */
function createAuditPersistenceRouter({ postgresPersistence = null } = {}) {
  let postgresReachable = Boolean(postgresPersistence && postgresPersistence.isOpen());

  /**
   * @returns {boolean}
   */
  function isAvailable() {
    return Boolean(postgresPersistence && postgresPersistence.isOpen() && postgresReachable);
  }

  /**
   * @returns {import('./persistenceContract').PersistenceAdapter|null}
   */
  function getActive() {
    return isAvailable() ? postgresPersistence : null;
  }

  /**
   * @returns {"postgres"|"none"}
   */
  function getEngine() {
    return isAvailable() ? "postgres" : "none";
  }

  /**
   * @param {boolean} reachable
   * @returns {void}
   */
  function setPostgresReachable(reachable) {
    postgresReachable = Boolean(reachable);
  }

  /**
   * Écrit une ligne d'audit. Panne réseau : no-op. Autre erreur : relancée (file `logAudit`).
   *
   * @param {object} entry
   * @returns {Promise<{ written: boolean }>}
   */
  async function write(entry) {
    if (!isAvailable()) {
      return { written: false };
    }
    try {
      await writeAudit(postgresPersistence, entry);
      return { written: true };
    } catch (error) {
      if (isPostgresConnectivityError(error)) {
        setPostgresReachable(false);
        return { written: false };
      }
      throw error;
    }
  }

  return {
    getActive,
    getEngine,
    setPostgresReachable,
    write
  };
}

module.exports = {
  createAuditPersistenceRouter
};
