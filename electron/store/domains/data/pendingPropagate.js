/**
 * Propagation d'un site ou prestataire validé vers les fiches métier orphelines.
 *
 * Appelé par `pendingSites.js` / `pendingIntervenants.js` après validation Paramètres.
 * Préférer passer le `tx` de la transaction de resolve pour atomicité.
 * Les UPDATE intervention restent dans les modules pending (même transaction).
 *
 * @module electron/store/domains/data/pendingPropagate
 */

const { requireDataPersistence } = require("./persistence");

/**
 * @param {import('../../../userStore')} store
 * @param {string} source
 * @param {import('../../persistence/persistenceContract').PersistenceAdapter|null|undefined} executor
 * @returns {import('../../persistence/persistenceContract').PersistenceAdapter}
 */
function resolveExecutor(store, source, executor) {
  return executor || requireDataPersistence(store, source);
}

/**
 * Propage un site vers ronde, gardiennage et main courante (`site_id` encore null).
 *
 * @param {import('../../../userStore')} store
 * @param {string} siteId
 * @param {string} canonicalDisplay
 * @param {string} likePattern
 * @param {import('../../persistence/persistenceContract').PersistenceAdapter} [executor] - Connexion/tx en cours
 * @returns {Promise<{ rondeEntries: number, gardiennageEntries: number, mainCouranteEntries: number }>}
 */
async function propagateSiteToOtherDomains(store, siteId, canonicalDisplay, likePattern, executor) {
  const sql = `SET site_id = ?, site_display = ? WHERE site_id IS NULL AND lower(site_display) LIKE lower(?)`;
  const params = [siteId, canonicalDisplay, likePattern];
  const db = resolveExecutor(store, "data:pendingPropagate:site", executor);
  const rondeResult = await db.run(`UPDATE ronde_entries ${sql}`, params);
  const gardiennageResult = await db.run(`UPDATE gardiennage_entries ${sql}`, params);
  const mainCourante = require("../mainCourante");
  const mainCouranteEntries = await mainCourante.propagateSiteIdToMainCouranteEntries(
    store,
    siteId,
    canonicalDisplay,
    likePattern,
    db
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
 * @param {import('../../persistence/persistenceContract').PersistenceAdapter} [executor] - Connexion/tx en cours
 * @returns {Promise<{ rondeEntries: number, gardiennageEntries: number }>}
 */
async function propagateIntervenantToOtherDomains(store, intervenantId, finalName, originalName, executor) {
  const sql = `SET intervenant_id = ?, intervenant_name = ? WHERE intervenant_id IS NULL AND lower(intervenant_name) = lower(?)`;
  const params = [intervenantId, finalName, originalName];
  const db = resolveExecutor(store, "data:pendingPropagate:intervenant", executor);
  const gardiennageResult = await db.run(`UPDATE gardiennage_entries ${sql}`, params);
  const rondeResult = await db.run(`UPDATE ronde_entries ${sql}`, params);
  return {
    rondeEntries: Number(rondeResult.changes || 0),
    gardiennageEntries: Number(gardiennageResult.changes || 0)
  };
}

module.exports = { propagateSiteToOtherDomains, propagateIntervenantToOtherDomains };
