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
      settings: normalizeBoolean(current.settings, !isOperateur)
    };
    store.db.prepare("UPDATE users SET page_access_json = ? WHERE id = ?").run(JSON.stringify(normalized), userRow.id);
  }
}

module.exports = {
  ensureUsersSitesSchema
};
