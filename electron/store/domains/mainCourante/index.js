/**
 * Domaine Main courante — PostgreSQL only.
 *
 * @module electron/store/domains/mainCourante
 */

const entries = require("./entries");
const { mapMainCouranteRow } = require("./mapping");

module.exports = {
  mapMainCouranteRow,
  ...entries
};
