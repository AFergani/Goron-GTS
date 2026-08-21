/**
 * Préférences utilisateur persistées dans PostgreSQL (`users.theme_mode`).
 *
 * Lecture et mise à jour du thème clair/sombre pour le compte connecté.
 * IPC `preferences:get` / `preferences:set` ; consommé par `AppShell` côté UI.
 * Écriture : transaction + `FOR UPDATE` (évite courses multi-postes sur le même compte).
 *
 * @module electron/store/domains/users/userPreferences
 */

const { refreshUsersCache } = require("./authUsers");

/**
 * Exige la persistance PostgreSQL des utilisateurs.
 *
 * @param {import('../../../userStore')} store
 * @returns {import('../../persistence/persistenceContract').PersistenceAdapter}
 */
function requirePersistence(store) {
  if (typeof store.assertPostgresAvailableForUsers === "function") {
    store.assertPostgresAvailableForUsers();
  }
  const db = typeof store.getUsersPersistence === "function" ? store.getUsersPersistence() : null;
  if (!db) {
    store.fail(
      "users",
      "Base PostgreSQL inaccessible. La gestion des comptes et la connexion sont indisponibles tant que le serveur n'est pas disponible.",
      "PG_UNAVAILABLE"
    );
  }
  return db;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Lit le thème du compte actif depuis PostgreSQL.
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string, requesterUsername: string }} params
 * @returns {Promise<{ themeMode: 'light'|'dark' }>}
 */
async function getUserPreferences(store, { requesterRole, requesterUsername }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requirePersistence(store);
  const username = normalizeUsername(requesterUsername);
  const row = await db.get("SELECT theme_mode, is_active FROM users WHERE username = ? LIMIT 1", [username]);
  if (!row || !Boolean(Number(row.is_active))) {
    store.fail("preferences:get", "Utilisateur introuvable.", "AUTH_USER_NOT_FOUND", { requesterUsername });
  }
  const themeMode = row.theme_mode === "light" ? "light" : "dark";
  return { themeMode };
}

/**
 * Met à jour le thème du compte actif (valeur normalisée `light` ou `dark`).
 * Pas d'entrée dans le journal d'audit (préférence personnelle non métier).
 *
 * @param {import('../../../userStore')} store
 * @param {{ requesterRole: string, requesterUsername: string, themeMode?: string }} params
 * @returns {Promise<{ success: true, themeMode: 'light'|'dark' }>}
 */
async function setUserPreferences(store, { requesterRole, requesterUsername, themeMode }) {
  store.ensureDataReaderRole(requesterRole);
  const db = requirePersistence(store);
  const username = normalizeUsername(requesterUsername);
  const nextTheme = themeMode === "light" ? "light" : "dark";
  const resultTheme = await db.transaction(async (tx) => {
    const row = await tx.get(
      "SELECT theme_mode, is_active FROM users WHERE username = ? FOR UPDATE",
      [username]
    );
    if (!row || !Boolean(Number(row.is_active))) {
      store.fail("preferences:set", "Utilisateur introuvable.", "AUTH_USER_NOT_FOUND", { requesterUsername });
    }
    const beforeTheme = row.theme_mode === "light" ? "light" : "dark";
    if (beforeTheme === nextTheme) {
      return nextTheme;
    }
    const result = await tx.run("UPDATE users SET theme_mode = ?, updated_at = ? WHERE username = ?", [
      nextTheme,
      new Date().toISOString(),
      username
    ]);
    if (result.changes === 0) {
      store.fail("preferences:set", "Utilisateur introuvable.", "AUTH_USER_NOT_FOUND", { requesterUsername });
    }
    return nextTheme;
  });
  if (typeof refreshUsersCache === "function") {
    await refreshUsersCache(store);
  }
  return { success: true, themeMode: resultTheme };
}

module.exports = {
  getUserPreferences,
  setUserPreferences
};
