/**
 * Surveillance des transitions d'accessibilité PostgreSQL.
 *
 * Ne journalise pas le polling : uniquement les changements d'état
 * (injoignable au 1er contrôle, perte, reconnexion).
 * Écrit dans `{userData}/gts-pg-events.log`.
 *
 * Consommé par `system:getPostgresLabHealth` (badge DB).
 * `resetPostgresLabMonitor` : après save / reconnexion admin, pour rejouer
 * un premier contrôle sur la nouvelle config.
 *
 * @module electron/store/persistence/postgresLabMonitor
 */

const { probePostgresLab } = require("./postgresLabProbe");
const { appendPostgresEvent } = require("./postgresEventLog");

const EVENT_SOURCE = "system:postgresLab";

/** @type {boolean|null} Dernier état connu ; `null` = pas encore de sonde. */
let lastReachable = null;

/**
 * Réinitialise l'état (nouvelle config ou reconnexion forcée).
 *
 * @returns {void}
 */
function resetPostgresLabMonitor() {
  lastReachable = null;
}

/**
 * Écrit une ligne de transition dans le journal local.
 *
 * @param {string} code
 * @param {string} messageFr
 * @param {{ host: string, port: number, database: string, error: string|null, checkedAt: string }} result
 * @returns {void}
 */
function emitTransition(code, messageFr, result) {
  appendPostgresEvent({
    source: EVENT_SOURCE,
    code,
    messageFr,
    details: {
      host: result.host,
      port: result.port,
      database: result.database,
      error: result.error,
      checkedAt: result.checkedAt
    }
  });
}

/**
 * Sonde PostgreSQL et journalise uniquement les transitions.
 *
 * @returns {Promise<{ reachable: boolean, engine: "postgres", host: string, port: number, database: string, error: string|null, checkedAt: string, transition: "none"|"lost"|"restored"|"unavailable_at_start" }>}
 */
async function probePostgresLabMonitored() {
  const result = await probePostgresLab();
  const next = Boolean(result.reachable);
  /** @type {"none"|"lost"|"restored"|"unavailable_at_start"} */
  let transition = "none";

  if (lastReachable === null) {
    lastReachable = next;
    if (!next) {
      transition = "unavailable_at_start";
      emitTransition(
        "PG_LAB_UNREACHABLE",
        "PostgreSQL injoignable au premier contrôle.",
        result
      );
    }
    return { ...result, transition };
  }

  if (lastReachable === true && next === false) {
    transition = "lost";
    emitTransition("PG_LAB_CONNECTION_LOST", "Perte de connexion PostgreSQL.", result);
  } else if (lastReachable === false && next === true) {
    transition = "restored";
    emitTransition("PG_LAB_CONNECTION_RESTORED", "Reconnexion PostgreSQL rétablie.", result);
  }

  lastReachable = next;
  return { ...result, transition };
}

module.exports = {
  probePostgresLabMonitored,
  resetPostgresLabMonitor
};
