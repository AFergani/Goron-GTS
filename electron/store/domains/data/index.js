/**
 * Domaines Paramètres → Gestion des données / variables / modèles (référentiels PG + audit d'import).
 *
 * Point d'entrée unique pour `UserStore` et réexports des modules du dossier.
 * Les responsables Fransor sont dans `domains/fransor/` (périmètre métier complet).
 *
 * @module electron/store/domains/data
 */

const referentials = require("./referentials");
const holidays = require("./holidays");
const rondeMotifTypes = require("./rondeMotifTypes");
const importAudit = require("./importAudit");
const formVariables = require("./formVariables");
const templateAssignments = require("./templateAssignments");

module.exports = {
  referentials,
  holidays,
  rondeMotifTypes,
  importAudit,
  formVariables,
  templateAssignments
};
