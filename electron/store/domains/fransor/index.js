/**
 * Domaine Fransor (page métier + responsables Paramètres) — PostgreSQL only.
 *
 * @module electron/store/domains/fransor
 */

const responsables = require("./responsables");
const closures = require("./closures");
const accompagnements = require("./accompagnements");

module.exports = {
  ...responsables,
  ...closures,
  ...accompagnements
};
