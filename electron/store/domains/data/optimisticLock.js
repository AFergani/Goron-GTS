/**
 * Contrôle de version optimiste pour les référentiels Paramètres.
 *
 * Comparaison `updated_at` (SQL) vs `expectedUpdatedAt` (client).
 * À utiliser dans une transaction après `SELECT … FOR UPDATE`.
 *
 * @module electron/store/domains/data/optimisticLock
 */

/**
 * Refuse l'écriture si la ligne a changé depuis le chargement côté UI.
 *
 * @param {import('../../../userStore')} store
 * @param {string} source - Préfixe d'erreur
 * @param {{ updated_at?: unknown }} row - Ligne SQL verrouillée
 * @param {unknown} expectedUpdatedAt - Version vue par le client (`null` / `""` si jamais mise à jour)
 * @param {string} conflictCode - Code machine (ex. `DATA_SITE_CONFLICT`)
 * @param {string} [messageFr]
 * @returns {void}
 */
function assertOptimisticLock(
  store,
  source,
  row,
  expectedUpdatedAt,
  conflictCode,
  messageFr = "Cette fiche a été modifiée ailleurs. Actualisez la liste puis réessayez."
) {
  if (String(row?.updated_at || "") !== String(expectedUpdatedAt ?? "")) {
    store.fail(source, messageFr, conflictCode);
  }
}

module.exports = { assertOptimisticLock };
