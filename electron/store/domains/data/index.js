/**
 * Barrel Paramètres → Gestion des données (référentiels PG, variables, modèles, import).
 *
 * Consommé par `UserStore`. Les domaines métier (rondes / gardiennage) importent
 * `holidays.js` directement. Responsables Fransor : `domains/fransor/`.
 * Files d'attente site / prestataire : partagées par tous les formulaires de création.
 *
 * @module electron/store/domains/data
 */

const referentials = require("./referentials");
const holidays = require("./holidays");
const rondeMotifTypes = require("./rondeMotifTypes");
const importAudit = require("./importAudit");
const formVariables = require("./formVariables");
const templateAssignments = require("./templateAssignments");
const pendingSites = require("./pendingSites");
const pendingIntervenants = require("./pendingIntervenants");

module.exports = {
  referentials,
  holidays,
  rondeMotifTypes,
  importAudit,
  formVariables,
  templateAssignments,
  pendingSites,
  pendingIntervenants
};
