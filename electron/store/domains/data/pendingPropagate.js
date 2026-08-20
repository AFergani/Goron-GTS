/**
 * Propagation d'un site ou prestataire validé vers les fiches métier orphelines.
 *
 * Appelé par `pendingSites.js` / `pendingIntervenants.js` après validation Paramètres.
 * Met à jour ronde, gardiennage, main courante (site) ; les UPDATE intervention
 * restent dans les modules pending (même transaction que la validation).
 *
 * @module electron/store/domains/data/pendingPropagate
 */

const { requireDataPersistence } = require("./persistence");

/**
 * Propage un site vers ronde, gardiennage et main courante (`site_id` encore null).
 *
 * @param {import('../../../userStore')} store
 * @param {string} siteId
 * @param {string} canonicalDisplay
 * @param {string} likePattern
 * @returns {Promise<{ rondeEntries: number, gardiennageEntries: number, mainCouranteEntries: number }>}
 */
async function propagateSiteToOtherDomains(store, siteId, canonicalDisplay, likePattern) {
  const sql = `SET site_id = ?, site_display = ? WHERE site_id IS NULL AND lower(site_display) LIKE lower(?)`;
  const params = [siteId, canonicalDisplay, likePattern];
  const db = requireDataPersistence(store, "data:pendingPropagate:site");
  const rondeResult = await db.run(`UPDATE ronde_entries ${sql}`, params);
  const gardiennageResult = await db.run(`UPDATE gardiennage_entries ${sql}`, params);
  const mainCourante = require("../mainCourante");
  const mainCouranteEntries = await mainCourante.propagateSiteIdToMainCouranteEntries(
    store,
    siteId,
    canonicalDisplay,
    likePattern
  );
  return {
    rondeEntries: Number(rondeResult.changes || 0),
    gardiennageEntries: Number(gardiennageResult.changes || 0),
    mainCouranteEntries
  };
}

/**
 * Propage un prestataire vers gardiennage et ronde (`intervenant_id` encore null).
 *
 * @param {import('../../../userStore')} store
 * @param {string} intervenantId
 * @param {string} finalName
 * @param {string} originalName
 * @returns {Promise<{ rondeEntries: number, gardiennageEntries: number }>}
 */
async function propagateIntervenantToOtherDomains(store, intervenantId, finalName, originalName) {
  const sql = `SET intervenant_id = ?, intervenant_name = ? WHERE intervenant_id IS NULL AND lower(intervenant_name) = lower(?)`;
  const params = [intervenantId, finalName, originalName];
  const db = requireDataPersistence(store, "data:pendingPropagate:intervenant");
  const gardiennageResult = await db.run(`UPDATE gardiennage_entries ${sql}`, params);
  const rondeResult = await db.run(`UPDATE ronde_entries ${sql}`, params);
  return {
    rondeEntries: Number(rondeResult.changes || 0),
    gardiennageEntries: Number(gardiennageResult.changes || 0)
  };
}

module.exports = { propagateSiteToOtherDomains, propagateIntervenantToOtherDomains };
