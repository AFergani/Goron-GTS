function createDatabaseAdminService(deps) {
  const {
    fs,
    path,
    isDev,
    readAppConfig,
    writeAppConfig,
    resolveDbPath,
    normalizeNestedQuarterDbPath,
    getDbStorageLayoutFromPath,
    setUserStoreByPath,
    refreshWriterRuntime,
    canManageDatabase,
    canManageArchiveSession,
    getActiveUserRole,
    getArchiveRuntime,
    setArchiveRuntime,
    getUserStore
  } = deps;

  function getDbConfig() {
    const dbPath = resolveDbPath();
    return {
      configured: Boolean(dbPath),
      dbPath,
      isDev
    };
  }

  function listAvailableDatabases() {
    const dbPath = resolveDbPath();
    if (!dbPath) return { activeDbPath: null, items: [] };
    const appCfg = readAppConfig();
    const sourceDbPath = String(appCfg.activeSourceDbPath || "").trim();
    const layout = getDbStorageLayoutFromPath(dbPath);
    const runtime = getArchiveRuntime();
    const items = [];
    const pushIfDb = (fullPath) => {
      if (!fullPath || !fs.existsSync(fullPath)) return;
      const ext = path.extname(fullPath).toLowerCase();
      if (![".db", ".sqlite", ".sqlite3"].includes(ext)) return;
      items.push({
        path: fullPath,
        name: path.basename(fullPath),
        isActive: path.resolve(fullPath) === path.resolve(dbPath),
        isSourceActive: Boolean(sourceDbPath) && path.resolve(fullPath) === path.resolve(sourceDbPath),
        lastModifiedAt: fs.statSync(fullPath).mtime.toISOString()
      });
    };
    if (fs.existsSync(layout.activeDir)) {
      const files = fs.readdirSync(layout.activeDir).sort((a, b) => a.localeCompare(b));
      for (const name of files) {
        pushIfDb(path.join(layout.activeDir, name));
      }
    } else {
      pushIfDb(dbPath);
    }
    if (fs.existsSync(layout.archivesDir)) {
      const files = fs.readdirSync(layout.archivesDir).sort((a, b) => a.localeCompare(b));
      for (const name of files) {
        pushIfDb(path.join(layout.archivesDir, name));
      }
    }
    return {
      activeDbPath: dbPath,
      sourceDbPath: sourceDbPath || null,
      archiveSession: runtime.archiveSession || null,
      items
    };
  }

  function switchActiveDatabase(nextDbPath, { requesterRole = null, requesterUsername = "system:db-switch" } = {}) {
    const requestedPath = normalizeNestedQuarterDbPath(String(nextDbPath || "").trim());
    const layout = getDbStorageLayoutFromPath(requestedPath);
    const ext = path.extname(requestedPath).toLowerCase();
    const canonicalActivePath = path.join(layout.activeDir, `gts-active${ext || ".db"}`);
    const targetPath = canonicalActivePath;
    if (!canManageDatabase(requesterUsername)) {
      throw new Error("Accès refusé: seuls le directeur de station, le responsable de station ou le dev peuvent changer la base de données.");
    }
    if (!requestedPath || !fs.existsSync(requestedPath)) {
      throw new Error("Base cible introuvable.");
    }
    const extCheck = path.extname(requestedPath).toLowerCase();
    if (![".db", ".sqlite", ".sqlite3"].includes(extCheck)) {
      throw new Error("Format de base non supporté.");
    }
    fs.mkdirSync(layout.activeDir, { recursive: true });
    if (path.resolve(requestedPath) !== path.resolve(canonicalActivePath)) {
      fs.copyFileSync(requestedPath, canonicalActivePath);
    }
    const requester = String(requesterUsername || "").trim().toLowerCase() || "system:db-switch";
    const requestedNormalized = path.resolve(requestedPath);
    const archiveDirNormalized = path.resolve(layout.archivesDir);
    const restoredFromArchive = requestedNormalized.startsWith(`${archiveDirNormalized}${path.sep}`);
    const runtime = getArchiveRuntime();
    const currentArchiveSession = runtime.archiveSession || {
      active: false,
      openedBy: null,
      openedAt: null,
      sourceDbPath: null,
      activeDbPath: null
    };
    if (restoredFromArchive && !canManageArchiveSession(requester)) {
      throw new Error(
        currentArchiveSession.active && currentArchiveSession.openedBy
          ? `Base de données ouverte sur : ${currentArchiveSession.openedBy}. Accès archive en lecture seule.`
          : "Accès archive en lecture seule. Seul un responsable/dev peut charger une archive."
      );
    }
    if (
      currentArchiveSession.active &&
      currentArchiveSession.openedBy &&
      currentArchiveSession.openedBy !== requester &&
      getActiveUserRole(requester) !== "DEV"
    ) {
      throw new Error(`Base de données ouverte sur : ${currentArchiveSession.openedBy}. Accès archive en lecture seule.`);
    }
    const previousPath = resolveDbPath();
    writeAppConfig({ ...readAppConfig(), dbPath: targetPath, activeSourceDbPath: requestedPath });
    setUserStoreByPath(targetPath);
    refreshWriterRuntime();
    const userStore = getUserStore();

    if (restoredFromArchive) {
      setArchiveRuntime({
        ...runtime,
        archiveSession: {
          active: true,
          openedBy: requester,
          openedAt: new Date().toISOString(),
          sourceDbPath: requestedPath,
          activeDbPath: targetPath
        }
      });
      userStore.logAudit({
        actorUsername: requester,
        action: "DB_ARCHIVE_SESSION_ENTER",
        details: { sourceDbPath: requestedPath, activeDbPath: targetPath }
      });
    } else if (currentArchiveSession.active) {
      setArchiveRuntime({
        ...runtime,
        archiveSession: {
          active: false,
          openedBy: null,
          openedAt: null,
          sourceDbPath: null,
          activeDbPath: targetPath
        }
      });
      userStore.logAudit({
        actorUsername: requester,
        action: "DB_ARCHIVE_SESSION_EXIT",
        details: {
          previousSourceDbPath: currentArchiveSession.sourceDbPath || null,
          activeDbPath: targetPath
        }
      });
    }
    userStore.logAudit({
      actorUsername: "system:db-switch",
      action: "DB_ACTIVE_SWITCH",
      details: { beforeDbPath: previousPath || null, afterDbPath: targetPath }
    });
    return {
      success: true,
      activeDbPath: targetPath,
      sourceDbPath: requestedPath,
      restoredFromArchive
    };
  }

  return {
    getDbConfig,
    listAvailableDatabases,
    switchActiveDatabase
  };
}

module.exports = {
  createDatabaseAdminService
};
