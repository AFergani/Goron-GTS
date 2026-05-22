/**
 * Migration légère des droits de navigation utilisateur (`users.page_access_json`).
 *
 * Troisième étape de `UserStore.ensureSchema()` (après `schemaBase` et `schemaRonde`).
 * Ne crée pas de tables : la table `users` et `data_sites` sont dans `schemaBase`.
 * Réécrit chaque compte avec un JSON normalisé (clés connues, booléens explicites).
 */

/**
 * Normalise `page_access_json` pour tous les utilisateurs existants.
 *
 * Règles par défaut si une clé est absente ou invalide :
 * - `mainCourante`, `fransor`, `intervention`, `rondes`, `gardiennage` : `true`
 * - `settings` : `false` pour le rôle opérateur, `true` sinon
 *
 * Effet de bord : un `UPDATE` par ligne utilisateur à chaque démarrage du store
 * (idempotent si le JSON est déjà conforme).
 *
 * @param {import('../userStore')} store
 * @param {{ roles: { OPERATEUR: string } }} options - Constantes de rôles (`ROLE` depuis `userStore`).
 * @returns {void}
 */
function ensureUsersSitesSchema(store, { roles }) {
  const usersWithAccess = store.db.prepare("SELECT id, role, page_access_json FROM users").all();
  const normalizeBoolean = (value, fallback) => (typeof value === "boolean" ? value : fallback);
  for (const userRow of usersWithAccess) {
    let parsed = null;
    try {
      parsed = userRow.page_access_json ? JSON.parse(userRow.page_access_json) : null;
    } catch {
      parsed = null;
    }
    const isOperateur = String(userRow.role || "") === roles.OPERATEUR;
    const current = parsed && typeof parsed === "object" ? parsed : {};
    const normalized = {
      mainCourante: normalizeBoolean(current.mainCourante, true),
      fransor: normalizeBoolean(current.fransor, true),
      intervention: normalizeBoolean(current.intervention, true),
      rondes: normalizeBoolean(current.rondes, true),
      gardiennage: normalizeBoolean(current.gardiennage, true),
      settings: normalizeBoolean(current.settings, !isOperateur)
    };
    store.db.prepare("UPDATE users SET page_access_json = ? WHERE id = ?").run(JSON.stringify(normalized), userRow.id);
  }
}

module.exports = {
  ensureUsersSitesSchema
};
