/**
 * Façade publique du domaine Rondes, stocké exclusivement dans PostgreSQL.
 *
 * La façade ne conserve que les exports actifs du domaine ; aucune compatibilité
 * historique ou ancien chemin SQLite n'est exposé ici.
 *
 * @module electron/store/domains/ronde
 */

const entries = require("./entries");
const plannedProfiles = require("./plannedProfiles");
const { autoCloseExpiredExceptionalRondes } = require("./autoClose");

module.exports = {
  ...entries,
  ...plannedProfiles,
  autoCloseExpiredExceptionalRondes
};
