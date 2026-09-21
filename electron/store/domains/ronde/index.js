/**
 * Façade publique du domaine Rondes (PostgreSQL).
 *
 * CRUD : `entries.js`. Lots : `entriesBatch.js`.
 *
 * @module electron/store/domains/ronde
 */

const entries = require("./entries");
const entriesBatch = require("./entriesBatch");
const plannedProfiles = require("./plannedProfiles");
const { autoCloseExpiredExceptionalRondes } = require("./autoClose");

module.exports = {
  ...entries,
  ...entriesBatch,
  ...plannedProfiles,
  autoCloseExpiredExceptionalRondes
};
