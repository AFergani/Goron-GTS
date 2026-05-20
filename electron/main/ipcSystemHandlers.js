function registerSystemIpcHandlers(deps) {
  const {
    handleIpc,
    handleIpcAuth,
    getOptionalAuthContext,
    getDbConfig,
    listAvailableDatabases,
    switchActiveDatabase,
    archiveRuntime,
    ARCHIVE_LOGICAL_DELAY_DAYS,
    ARCHIVE_SCHEDULER_INTERVAL_MS,
    getQuarterKey,
    resolveDbPath,
    canRunArchiveManually,
    runArchiveCycle,
    getWriterRuntime,
    getWriterQueueStats,
    getLocalNodeIdentity,
    ensureStore,
    getUserStore,
    generateWriterConfigFile,
    documentTemplates,
    getWriterLogContext,
    fallbackWriterLogsDir,
    fs,
    shell,
    app,
    setIsAppQuitting,
    getMainWindow,
    shouldEnableTrayBackgroundMode,
    setupTrayIfNeeded,
    dialog,
    path,
    readAppConfig,
    writeAppConfig,
    setUserStoreByPath,
    refreshWriterRuntime,
    normalizeNestedQuarterDbPath,
    getDbStorageLayoutFromPath,
    canManageDatabase,
    setDevToolsAccessEnabled
  } = deps;

  handleIpc("system:getDbConfig", (payload) => {
    const cfg = getDbConfig();
    const ctx = getOptionalAuthContext(payload);
    if (!ctx) {
      return { configured: cfg.configured, dbPath: null, isDev: cfg.isDev };
    }
    return cfg;
  });

  handleIpc("system:listDatabases", (payload) => {
    const listing = listAvailableDatabases();
    const ctx = getOptionalAuthContext(payload);
    if (!ctx) {
      return { activeDbPath: null, sourceDbPath: null, archiveSession: null, items: [] };
    }
    return listing;
  });

  handleIpcAuth("system:switchDatabase", ({ dbPath, requesterRole, requesterUsername }) =>
    switchActiveDatabase(dbPath, { requesterRole, requesterUsername })
  );

  handleIpc("system:getArchiveStatus", (payload) => {
    const ctx = getOptionalAuthContext(payload);
    const base = {
      ...archiveRuntime,
      delayDays: ARCHIVE_LOGICAL_DELAY_DAYS,
      schedulerIntervalMs: ARCHIVE_SCHEDULER_INTERVAL_MS,
      quarterKey: getQuarterKey(new Date())
    };
    if (!ctx) {
      return { ...base, dbPath: null, archiveSession: null };
    }
    return { ...base, dbPath: resolveDbPath() };
  });

  handleIpcAuth("system:runArchiveNow", async (payload = {}) => {
    const requesterUsername = payload?.requesterUsername;
    if (!canRunArchiveManually(requesterUsername)) {
      throw new Error("Accès refusé: action réservée au directeur de station, responsable de station ou dev.");
    }
    return runArchiveCycle({
      trigger: "manual",
      requesterUsername: requesterUsername || "system:archive"
    });
  });

  handleIpcAuth("system:getWriterStatus", () => {
    const writerRuntime = getWriterRuntime();
    return {
      enabled: writerRuntime.enabled,
      role: writerRuntime.role,
      transportMode: writerRuntime.transportMode,
      configPath: writerRuntime.configPath,
      sharedRoot: writerRuntime.sharedRoot,
      policy: writerRuntime.policy,
      masterHost: writerRuntime.masterHost,
      masterPort: writerRuntime.masterPort,
      backupHost: writerRuntime.backupHost,
      backupPort: writerRuntime.backupPort,
      failoverEnabled: writerRuntime.failoverEnabled,
      connectivity: writerRuntime.connectivity,
      alertActive:
        (writerRuntime.role === "master" && writerRuntime.connectivity.backupReachable === false) ||
        (writerRuntime.role === "backup" && writerRuntime.connectivity.masterReachable === false),
      localHostname: writerRuntime.localHostname,
      localWhoami: writerRuntime.localWhoami,
      writerLogDir: getWriterLogContext().logsDir,
      writerLogFile: getWriterLogContext().logFile
    };
  });

  handleIpcAuth("system:getWriterQueueStats", () => getWriterQueueStats());
  handleIpcAuth("system:getLocalNodeIdentity", () => getLocalNodeIdentity());

  handleIpc("system:setDevToolsEnabled", (payload = {}) => {
    const requestedEnabled = Boolean(payload?.enabled);
    if (!requestedEnabled) {
      if (setDevToolsAccessEnabled) setDevToolsAccessEnabled(false);
      return { success: true, enabled: false };
    }
    const ctx = getOptionalAuthContext(payload);
    if (!ctx || ctx.role !== "DEV") {
      throw new Error("Accès refusé: seuls les comptes Admin peuvent activer les DevTools.");
    }
    if (setDevToolsAccessEnabled) setDevToolsAccessEnabled(true);
    return { success: true, enabled: true };
  });

  handleIpcAuth("system:generateWriterConfig", async (payload = {}) => {
    const userStore = getUserStore();
    userStore.ensureDataManagerRole(payload.requesterRole);
    const result = await generateWriterConfigFile(payload);
    if (result.success) {
      userStore.logAudit({
        actorUsername: payload.requesterUsername || "unknown",
        action: "DATA_WRITER_CONFIG_GENERATED",
        details: { filePath: result.filePath }
      });
    }
    return result;
  });

  handleIpcAuth("system:getDocumentTemplate", ({ templateName }) => documentTemplates.getDocumentTemplate(templateName));
  handleIpcAuth("system:listDocumentTemplates", () => documentTemplates.listDocumentTemplatesPayload());
  handleIpcAuth("system:installDocumentTemplateCopy", (payload) => documentTemplates.installDocumentTemplateCopy(payload));
  handleIpcAuth("system:listTemplateAssignments", (payload) => {
    ensureStore();
    return getUserStore().listTemplateAssignments(payload);
  });
  handleIpcAuth("system:upsertScopedDocumentTemplate", (payload) => documentTemplates.upsertScopedDocumentTemplate(payload));
  handleIpcAuth("system:deleteTemplateAssignment", (payload) => {
    ensureStore();
    return getUserStore().deleteTemplateAssignment(payload);
  });
  handleIpcAuth("system:resolveTemplateFileForContext", (payload) => {
    ensureStore();
    return getUserStore().resolveTemplateFileForContext(payload);
  });
  handleIpcAuth("system:openTemplatesFolder", () => {
    try {
      const dir = documentTemplates.resolveWritableTemplatesDirectory();
      fs.mkdirSync(dir, { recursive: true });
      return shell.openPath(dir).then((error) => ({ success: !error, path: dir, error: error || null }));
    } catch (e) {
      return Promise.resolve({
        success: false,
        path: null,
        error: e instanceof Error ? e.message : "Dossier des modèles indisponible."
      });
    }
  });

  handleIpcAuth("system:openWriterLogFolder", () => {
    const primaryDir = getWriterLogContext().logsDir;
    try {
      fs.mkdirSync(primaryDir, { recursive: true });
      return shell.openPath(primaryDir).then((error) => ({ success: !error, path: primaryDir, error: error || null }));
    } catch {
      try {
        fs.mkdirSync(fallbackWriterLogsDir, { recursive: true });
        return shell.openPath(fallbackWriterLogsDir).then((error) => ({
          success: !error,
          path: fallbackWriterLogsDir,
          error: error || null
        }));
      } catch {
        return Promise.resolve({ success: false, path: fallbackWriterLogsDir, error: "Impossible d'ouvrir le dossier des logs." });
      }
    }
  });

  handleIpc("system:getDbHealth", (payload) => {
    const cfg = getDbConfig();
    if (!cfg.configured || !getUserStore()) {
      return { configured: false, writable: false };
    }
    const ctx = getOptionalAuthContext(payload);
    if (!ctx) {
      return { configured: true, writable: false };
    }
    const health = getUserStore().getDbHealth();
    return { configured: true, writable: Boolean(health.writable) };
  });

  // Pas d’auth requise : actions locales (équivalent barre de titre), utilisables sans session (écran de connexion).
  handleIpc("system:quitApp", () => {
    if (setIsAppQuitting) setIsAppQuitting(true);
    app.quit();
    return { success: true };
  });

  handleIpc("system:minimizeApp", () => {
    const mainWindow = getMainWindow ? getMainWindow() : null;
    if (!mainWindow) return { success: false };
    if (shouldEnableTrayBackgroundMode && shouldEnableTrayBackgroundMode()) {
      mainWindow.hide();
      if (setupTrayIfNeeded) setupTrayIfNeeded();
      return { success: true };
    }
    if (!mainWindow.isMinimized()) {
      mainWindow.minimize();
    }
    return { success: true };
  });

  handleIpc("system:chooseDbPath", async (payload) => {
    const current = getDbConfig();
    if (current.configured) {
      const ctx = getOptionalAuthContext(payload);
      if (!ctx) {
        throw new Error("Accès refusé: reconnectez-vous pour modifier la base de données.");
      }
      if (!canManageDatabase(ctx.username)) {
        throw new Error("Accès refusé: seuls le directeur de station, le responsable de station ou le dev peuvent modifier la base de données.");
      }
    }

    const result = await dialog.showOpenDialog({
      title: "Selectionner le fichier base de donnees (.db)",
      defaultPath: current.dbPath || app.getPath("documents"),
      properties: ["openFile", "createDirectory"],
      filters: [
        { name: "Base SQLite", extensions: ["db", "sqlite", "sqlite3"] },
        { name: "Tous les fichiers", extensions: ["*"] }
      ]
    });

    if (result.canceled || !result.filePaths[0]) {
      return { configured: Boolean(current.dbPath), dbPath: current.dbPath, canceled: true };
    }

    const selectedDbPath = normalizeNestedQuarterDbPath(result.filePaths[0]);
    const layout = getDbStorageLayoutFromPath(selectedDbPath);
    const ext = path.extname(selectedDbPath).toLowerCase() || ".db";
    const canonicalActivePath = path.join(layout.activeDir, `gts-active${ext}`);
    fs.mkdirSync(layout.activeDir, { recursive: true });
    if (path.resolve(selectedDbPath) !== path.resolve(canonicalActivePath)) {
      fs.copyFileSync(selectedDbPath, canonicalActivePath);
    }
    writeAppConfig({ ...readAppConfig(), dbPath: canonicalActivePath, activeSourceDbPath: selectedDbPath });
    setUserStoreByPath(canonicalActivePath);
    refreshWriterRuntime();

    return { configured: true, dbPath: canonicalActivePath, canceled: false };
  });
}

module.exports = {
  registerSystemIpcHandlers
};
