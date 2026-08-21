/**
 * Façade du domaine Main courante — données métier dans PostgreSQL.
 *
 * @module electron/store/domains/mainCourante
 */

const entries = require("./entries");
const { mapMainCouranteRow } = require("./mapping");

module.exports = {
  mapMainCouranteRow,
  ...entries
};
