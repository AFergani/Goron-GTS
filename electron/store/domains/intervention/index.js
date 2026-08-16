/**
 * Façade du domaine Intervention — données métier dans PostgreSQL.
 *
 * @module electron/store/domains/intervention
 */

const entries = require("./entries");
const pendingSites = require("./pendingSites");
const pendingIntervenants = require("./pendingIntervenants");
const wordExtraFields = require("./wordExtraFields");
const { mapInterventionRow, parseExportExtraJson } = require("./mapping");

module.exports = {
  mapInterventionRow,
  parseExportExtraJson,
  ...entries,
  ...pendingSites,
  ...pendingIntervenants,
  ...wordExtraFields
};
