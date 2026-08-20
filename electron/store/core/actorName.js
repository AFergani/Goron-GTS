/**
 * Identifiant d'acteur pour l'audit et l'historique d'entité.
 *
 * Remplace les `requesterUsername || "unknown"` dispersés dans les domaines.
 * Distinct du repli `"system"` de `writeAudit` (ligne SQL si le champ est vide).
 *
 * @module electron/store/core/actorName
 */

/**
 * @param {unknown} username
 * @returns {string}
 */
function actorName(username) {
  return String(username || "unknown");
}

module.exports = { actorName };
