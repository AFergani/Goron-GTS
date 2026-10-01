/**
 * Barrel du domaine Gardiennage (page métier).
 *
 * Consommé par `UserStore` (API plate : `gardiennageDomain.listGardiennages…`).
 * Jobs de fond : `autoClose.js`, `openEndedHorizon.js`.
 * `helpers.js`, `mapping.js`, `plannerEngine.js` et `persistence.js`
 * s'importent en interne, pas via cette façade.
 *
 * @module electron/store/domains/gardiennage
 */

const entries = require("./entries");
const entriesLifecycle = require("./entriesLifecycle");
const { autoCloseExpiredGardiennageEntries } = require("./autoClose");
const { extendOpenEndedGardiennageHorizons } = require("./openEndedHorizon");

module.exports = {
  listGardiennages: entries.listGardiennages,
  getGardiennageTodayInProgressCount: entries.getGardiennageTodayInProgressCount,
  createGardiennage: entries.createGardiennage,
  updateGardiennage: entries.updateGardiennage,
  setGardiennageStatus: entriesLifecycle.setGardiennageStatus,
  requestGardiennageCancellation: entriesLifecycle.requestGardiennageCancellation,
  reviewGardiennageCancellation: entriesLifecycle.reviewGardiennageCancellation,
  closeGardiennage: entriesLifecycle.closeGardiennage,
  reopenGardiennage: entriesLifecycle.reopenGardiennage,
  deleteGardiennage: entriesLifecycle.deleteGardiennage,
  autoCloseExpiredGardiennageEntries,
  extendOpenEndedGardiennageHorizons
};
