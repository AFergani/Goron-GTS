/**
 * Surveillance des transitions d'accessibilité PostgreSQL.
 *
 * Ne journalise pas le polling : uniquement les changements d'état
 * (perte / reconnexion). Écrit dans le fichier local `gts-pg-events.log`.
 *
 * @module electron/store/persistence/postgresLabMonitor
 */

const { probePostgresLab } = require("./postgresLabProbe");
const { appendPostgresEvent } = require("./postgresEventLog");

/** @type {boolean|null} Dernier état connu ; `null` = pas encore de sonde. */
let lastReachable = null;

/**
 * Réinitialise l'état (tests / bascule de session).
 *
 * @returns {void}
 */
function resetPostgresLabMonitor() {
  lastReachable = null;
}

/**
 * Journalise un événement PG (fichier local + callback optionnel).
 *
 * @param {object} entry
 * @param {(entry: object) => void} [logError]
 * @returns {void}
 */
function emitEvent(entry, logError) {
  appendPostgresEvent(entry);
  if (typeof logError === "function") {
    try {
      logError(entry);
    } catch {
      // ignore
    }
  }
}

/**
 * Sonde PostgreSQL et journalise uniquement les transitions.
 *
 * @param {object} [options]
 * @param {(entry: { source: string, code: string, messageFr: string, details?: object }) => void} [options.logError]
 * @returns {Promise<{ reachable: boolean, engine: "postgres", host: string, port: number, database: string, error: string|null, checkedAt: string, transition: "none"|"lost"|"restored"|"unavailable_at_start" }>}
 */
async function probePostgresLabMonitored(options = {}) {
  const logError = typeof options.logError === "function" ? options.logError : null;
  const result = await probePostgresLab();
  const next = Boolean(result.reachable);
  /** @type {"none"|"lost"|"restored"|"unavailable_at_start"} */
  let transition = "none";

  if (lastReachable === null) {
    lastReachable = next;
    if (!next) {
      transition = "unavailable_at_start";
      emitEvent(
        {
          source: "system:postgresLab",
          code: "PG_LAB_UNREACHABLE",
          messageFr: "PostgreSQL injoignable au premier contrôle.",
          details: {
            host: result.host,
            port: result.port,
            database: result.database,
            error: result.error,
            checkedAt: result.checkedAt
          }
        },
        logError
      );
    }
    return { ...result, transition };
  }

  if (lastReachable === true && next === false) {
    transition = "lost";
    emitEvent(
      {
        source: "system:postgresLab",
        code: "PG_LAB_CONNECTION_LOST",
        messageFr: "Perte de connexion PostgreSQL.",
        details: {
          host: result.host,
          port: result.port,
          database: result.database,
          error: result.error,
          checkedAt: result.checkedAt
        }
      },
      logError
    );
  } else if (lastReachable === false && next === true) {
    transition = "restored";
    emitEvent(
      {
        source: "system:postgresLab",
        code: "PG_LAB_CONNECTION_RESTORED",
        messageFr: "Reconnexion PostgreSQL rétablie.",
        details: {
          host: result.host,
          port: result.port,
          database: result.database,
          checkedAt: result.checkedAt
        }
      },
      logError
    );
  }

  lastReachable = next;
  return { ...result, transition };
}

module.exports = {
  probePostgresLabMonitored,
  resetPostgresLabMonitor
};
