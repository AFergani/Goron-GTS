/**
 * Façade du domaine Intervention — données métier dans PostgreSQL.
 *
 * @module electron/store/domains/intervention
 */

const entries = require("./entries");
const { mapInterventionRow, parseExportExtraJson } = require("./mapping");

module.exports = {
  mapInterventionRow,
  parseExportExtraJson,
  ...entries
};
