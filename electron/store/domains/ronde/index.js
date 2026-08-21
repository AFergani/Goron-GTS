/**
 * Façade publique du domaine Rondes (PostgreSQL).
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
