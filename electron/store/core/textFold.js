/**
 * Repli de texte pour comparaisons d'unicité / recherche (casse et accents ignorés).
 *
 * Côté SQL : même alphabet français/latin via `translate` + ligatures, sans
 * extension PostgreSQL `unaccent`. À n'utiliser qu'avec une expression SQL
 * contrôlée (`code`, `label`, `?`) — jamais une saisie utilisateur brute.
 *
 * @module electron/store/core/textFold
 */

/** Caractères accentués (1 pour 1, même longueur que `FOLD_TO`). */
const FOLD_FROM =
  "ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñŸÿÝý";
const FOLD_TO = "AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyYy";

/**
 * Expression SQL PostgreSQL équivalente (trim + accents + ligatures + minuscules).
 *
 * @param {string} sqlExpr - Identifiant ou placeholder (`code`, `trim(label)`, `?`).
 * @returns {string}
 */
function sqlFoldExpr(sqlExpr) {
  const expr = String(sqlExpr || "").trim();
  if (!expr) {
    throw new Error("sqlFoldExpr : expression SQL obligatoire.");
  }
  return `lower(replace(replace(replace(replace(translate(trim(${expr}), '${FOLD_FROM}', '${FOLD_TO}'), 'œ', 'oe'), 'Œ', 'oe'), 'æ', 'ae'), 'Æ', 'ae'))`;
}

module.exports = {
  sqlFoldExpr
};
