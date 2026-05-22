/**
 * Préférences utilisateur persistées en base (table `users`, colonne `theme_mode`).
 *
 * Lecture et mise à jour du thème clair/sombre pour le compte connecté.
 * IPC `preferences:get` / `preferences:set` ; consommé par `AppShell` côté UI.
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * @param {import('../userStore')} store
 * @param {{ requesterRole: string, requesterUsername: string }} params
 * @returns {{ themeMode: 'light'|'dark' }}
 */
function getUserPreferences(store, { requesterRole, requesterUsername }) {
  store.ensureDataReaderRole(requesterRole);
  const username = normalizeUsername(requesterUsername);
  const row = store.db
    .prepare("SELECT theme_mode FROM users WHERE username = ? AND is_active = 1 LIMIT 1")
    .get(username);
  if (!row) {
    store.fail("preferences:get", "Utilisateur introuvable.", "AUTH_USER_NOT_FOUND", { requesterUsername });
  }
  const themeMode = row.theme_mode === "light" ? "light" : "dark";
  return { themeMode };
}

/**
 * Met à jour le thème du compte actif (valeur normalisée `light` ou `dark`).
 *
 * @param {import('../userStore')} store
 * @param {{ requesterRole: string, requesterUsername: string, themeMode?: string }} params
 * @returns {{ success: true, themeMode: 'light'|'dark' }}
 */
function setUserPreferences(store, { requesterRole, requesterUsername, themeMode }) {
  store.ensureDataReaderRole(requesterRole);
  const username = normalizeUsername(requesterUsername);
  const row = store.db
    .prepare("SELECT theme_mode FROM users WHERE username = ? AND is_active = 1 LIMIT 1")
    .get(username);
  if (!row) {
    store.fail("preferences:set", "Utilisateur introuvable.", "AUTH_USER_NOT_FOUND", { requesterUsername });
  }
  const beforeTheme = row.theme_mode === "light" ? "light" : "dark";
  const nextTheme = themeMode === "light" ? "light" : "dark";
  if (beforeTheme === nextTheme) {
    return { success: true, themeMode: nextTheme };
  }
  const result = store.db
    .prepare("UPDATE users SET theme_mode = ?, updated_at = ? WHERE username = ? AND is_active = 1")
    .run(nextTheme, new Date().toISOString(), username);
  if (result.changes === 0) {
    store.fail("preferences:set", "Utilisateur introuvable.", "AUTH_USER_NOT_FOUND", { requesterUsername });
  }
  store.logAudit({
    actorUsername: requesterUsername,
    action: "USER_PREFERENCES_THEME_UPDATE",
    targetUsername: username,
    details: {
      before: { themeMode: beforeTheme },
      after: { themeMode: nextTheme }
    }
  });
  return { success: true, themeMode: nextTheme };
}

module.exports = {
  getUserPreferences,
  setUserPreferences
};
