/**
 * Propagation des référentiels validés vers les domaines PostgreSQL.
 *
 * @module electron/store/domains/intervention/propagate
 */

/**
 * Propage un site vers les domaines métier PostgreSQL.
 *
 * @param {import('../../../userStore')} store
 * @param {string} siteId
 * @param {string} canonicalDisplay
 * @param {string} likePattern
 * @returns {Promise<object>}
 */
async function propagateSiteToOtherDomains(store, siteId, canonicalDisplay, likePattern) {
  const sql = `SET site_id = ?, site_display = ? WHERE site_id IS NULL AND lower(site_display) LIKE lower(?)`;
  const params = [siteId, canonicalDisplay, likePattern];
  const db = typeof store.getReferentialsPersistence === "function" ? store.getReferentialsPersistence() : null;
  const rondeResult = db
    ? await db.run(`UPDATE ronde_entries ${sql}`, params)
    : { changes: 0 };
  const gardiennageResult = db
    ? await db.run(`UPDATE gardiennage_entries ${sql}`, params)
    : { changes: 0 };
  const mainCourante = require("../mainCourante");
  const mainCouranteEntries = await mainCourante.propagateSiteIdToMainCouranteEntries(store, siteId, canonicalDisplay, likePattern);
  return {
    rondeEntries: Number(rondeResult.changes || 0),
    gardiennageEntries: Number(gardiennageResult.changes || 0),
    mainCouranteEntries
  };
}

/**
 * Propage un intervenant vers Gardiennage et Ronde PostgreSQL.
 *
 * @param {import('../../../userStore')} store
 * @param {string} intervenantId
 * @param {string} finalName
 * @param {string} originalName
 * @returns {Promise<{rondeEntries:number, gardiennageEntries:number}>}
 */
async function propagateIntervenantToOtherDomains(store, intervenantId, finalName, originalName) {
  const sql = `SET intervenant_id = ?, intervenant_name = ? WHERE intervenant_id IS NULL AND lower(intervenant_name) = lower(?)`;
  const params = [intervenantId, finalName, originalName];
  const db = typeof store.getReferentialsPersistence === "function" ? store.getReferentialsPersistence() : null;
  const gardiennageResult = db
    ? await db.run(`UPDATE gardiennage_entries ${sql}`, params)
    : { changes: 0 };
  const rondeResult = db
    ? await db.run(`UPDATE ronde_entries ${sql}`, params)
    : { changes: 0 };
  return {
    rondeEntries: Number(rondeResult.changes || 0),
    gardiennageEntries: Number(gardiennageResult.changes || 0)
  };
}

module.exports = { propagateSiteToOtherDomains, propagateIntervenantToOtherDomains };
