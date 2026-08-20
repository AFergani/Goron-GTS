/**
 * Barrel du domaine Fransor (page métier + responsables Paramètres).
 *
 * Consommé par `UserStore` (API plate : `fransorDomain.listFransor…`).
 * Les modules du dossier importent `persistence.js` directement.
 * `getActiveFransorResponsable` reste interne à `responsables.js`
 * (utilisé par les accompagnements, pas exposé ici).
 *
 * @module electron/store/domains/fransor
 */

const responsables = require("./responsables");
const closures = require("./closures");
const accompagnements = require("./accompagnements");

module.exports = {
  listFransorResponsables: responsables.listFransorResponsables,
  createFransorResponsable: responsables.createFransorResponsable,
  updateFransorResponsable: responsables.updateFransorResponsable,
  deleteFransorResponsable: responsables.deleteFransorResponsable,
  listFransorClosures: closures.listFransorClosures,
  upsertFransorClosure: closures.upsertFransorClosure,
  deleteFransorClosure: closures.deleteFransorClosure,
  listFransorEntriesByMonth: accompagnements.listFransorEntriesByMonth,
  upsertFransorEntry: accompagnements.upsertFransorEntry,
  listFransorMonthlyRecap: accompagnements.listFransorMonthlyRecap
};
