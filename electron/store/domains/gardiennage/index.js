/**
 * Façade publique du domaine Gardiennage, stocké exclusivement dans PostgreSQL.
 *
 * @module electron/store/domains/gardiennage
 */

const entries = require("./entries");
const { autoCloseExpiredGardiennageEntries } = require("./autoClose");
const {
  extendOpenEndedGardiennageHorizons
} = require("./openEndedHorizon");

module.exports = {
  ...entries,
  autoCloseExpiredGardiennageEntries,
  extendOpenEndedGardiennageHorizons
};
