function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

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

function setUserPreferences(store, { requesterRole, requesterUsername, themeMode }) {
  store.ensureDataReaderRole(requesterRole);
  const username = normalizeUsername(requesterUsername);
  const nextTheme = themeMode === "light" ? "light" : "dark";
  const result = store.db
    .prepare("UPDATE users SET theme_mode = ?, updated_at = ? WHERE username = ? AND is_active = 1")
    .run(nextTheme, new Date().toISOString(), username);
  if (result.changes === 0) {
    store.fail("preferences:set", "Utilisateur introuvable.", "AUTH_USER_NOT_FOUND", { requesterUsername });
  }
  return { success: true, themeMode: nextTheme };
}

module.exports = {
  getUserPreferences,
  setUserPreferences
};
