function createDbAccessControlService(deps) {
  const { getUserStore } = deps;

  function getActiveUserRole(username) {
    const userStore = getUserStore();
    if (!userStore?.db) return null;
    const row = userStore.db
      .prepare("SELECT role FROM users WHERE lower(username) = ? AND is_active = 1 LIMIT 1")
      .get(String(username || "").trim().toLowerCase());
    return row?.role || null;
  }

  function canManageArchiveSession(requesterUsername) {
    const userStore = getUserStore();
    if (!userStore?.db) return false;
    const row = userStore.db
      .prepare("SELECT role FROM users WHERE lower(username) = ? AND is_active = 1 LIMIT 1")
      .get(String(requesterUsername || "").trim().toLowerCase());
    return Boolean(row && (row.role === "RESPONSABLE" || row.role === "DEV"));
  }

  function canRunArchiveManually(requesterUsername) {
    const userStore = getUserStore();
    if (!userStore?.db) return false;
    const row = userStore.db
      .prepare("SELECT role, manager_profile FROM users WHERE lower(username) = ? AND is_active = 1 LIMIT 1")
      .get(String(requesterUsername || "").trim().toLowerCase());
    if (!row) return false;
    if (row.role === "DEV") return true;
    if (row.role !== "RESPONSABLE") return false;
    return row.manager_profile === "DIRECTEUR_STATION" || row.manager_profile === "RESPONSABLE_STATION";
  }

  function canManageDatabase(requesterUsername) {
    const userStore = getUserStore();
    if (!userStore?.db) return false;
    const row = userStore.db
      .prepare("SELECT role, manager_profile FROM users WHERE lower(username) = ? AND is_active = 1 LIMIT 1")
      .get(String(requesterUsername || "").trim().toLowerCase());
    if (!row) return false;
    if (row.role === "DEV") return true;
    if (row.role !== "RESPONSABLE") return false;
    return row.manager_profile === "DIRECTEUR_STATION" || row.manager_profile === "RESPONSABLE_STATION";
  }

  return {
    getActiveUserRole,
    canManageArchiveSession,
    canRunArchiveManually,
    canManageDatabase
  };
}

module.exports = {
  createDbAccessControlService
};
