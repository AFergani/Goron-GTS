/**
 * Routeur de persistance pour `audit_logs` (PostgreSQL only).
 *
 * - lecture / écriture uniquement sur PostgreSQL quand le pool est joignable ;
 * - si PG down : l'écriture d'audit est ignorée (no-op soft) ;
 * - plus de dual-write ni sync SQLite.
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
 * @property {() => boolean} isAvailable
 * @property {(entry: object) => Promise<{ written: boolean }>} write
 */

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
   * Écrit une ligne d'audit sur PostgreSQL uniquement.
   *
   * @param {object} entry
   * @returns {Promise<{ written: boolean }>}
   */
  async function write(entry) {
    if (!isAvailable()) {
      return { written: false };
    }
    const occurredAt = entry?.occurredAt || new Date().toISOString();
    try {
      await writeAudit(postgresPersistence, { ...entry, occurredAt });
      return { written: true };
    } catch {
      setPostgresReachable(false);
      return { written: false };
    }
  }

  return {
    getActive,
    getEngine,
    setPostgresReachable,
    isAvailable,
    write
  };
}

module.exports = {
  createAuditPersistenceRouter
};
