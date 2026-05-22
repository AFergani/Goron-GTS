/**
 * Enregistrement des canaux IPC système (`system:*`) : base SQLite, archivage, writer, modèles Word,
 * fenêtre applicative et configuration poste.
 *
 * Instancié via `registerSystemIpcHandlers` dans `main.js` ; exposé au renderer par `preload.js` / `gtsApiClient`.
 * Plusieurs canaux acceptent un `sessionToken` optionnel et masquent les chemins sensibles sans session valide.
 */

/**
 * Enregistre tous les handlers IPC système.
 *
 * @param {object} deps - Injections groupées depuis `main.js`.
 * @param {Function} deps.handleIpc - IPC sans authentification obligatoire (session optionnelle).
 * @param {Function} deps.handleIpcAuth - IPC avec `requesterRole` / `requesterUsername`.
 * @param {(payload?: object) => object|null} deps.getOptionalAuthContext - Valide `sessionToken` si présent.
 * @param {() => object} deps.getDbConfig - Config base (`databaseAdmin`).
 * @param {() => object} deps.listAvailableDatabases - Inventaire des `.db` actifs/archives.
 * @param {Function} deps.switchActiveDatabase - Bascule de base active.
 * @param {object} deps.archiveRuntime - État runtime archivage (référence mutable main).
 * @param {number} deps.ARCHIVE_LOGICAL_DELAY_DAYS - Délai archivage logique exposé UI.
 * @param {number} deps.ARCHIVE_SCHEDULER_INTERVAL_MS - Intervalle scheduler exposé UI.
 * @param {() => string} deps.getQuarterKey - Trimestre courant.
 * @param {() => string|null} deps.resolveDbPath - Chemin base active.
 * @param {(username: string) => boolean} deps.canRunArchiveManually - RBAC archivage manuel.
 * @param {Function} deps.runArchiveCycle - Exécution cycle archivage (`archiveRunner`).
 * @param {() => object} deps.getWriterRuntime - État writer local.
 * @param {() => object} deps.getWriterQueueStats - Statistiques file SMB.
 * @param {() => object} deps.getLocalNodeIdentity - Identité poste (hostname, etc.).
 * @param {() => void} deps.ensureStore
 * @param {() => import('../userStore')} deps.getUserStore
 * @param {Function} deps.generateWriterConfigFile - Génération `gts_writer-config.json`.
 * @param {object} deps.documentTemplates - Service modèles Word (`documentTemplates.js`).
 * @param {() => { logsDir: string, logFile: string }} deps.getWriterLogContext
 * @param {string} deps.fallbackWriterLogsDir - Repli si logs writer indisponibles.
 * @param {import('fs')} deps.fs
 * @param {import('electron').Shell} deps.shell - Ouverture dossiers dans l'OS.
 * @param {import('electron').App} deps.app
 * @param {(value: boolean) => void} [deps.setIsAppQuitting]
 * @param {() => import('electron').BrowserWindow|null} [deps.getMainWindow]
 * @param {() => boolean} [deps.shouldEnableTrayBackgroundMode]
 * @param {() => void} [deps.setupTrayIfNeeded]
 * @param {import('electron').Dialog} deps.dialog
 * @param {import('path')} deps.path
 * @param {() => object} deps.readAppConfig
 * @param {(config: object) => void} deps.writeAppConfig
 * @param {(dbPath: string) => void} deps.setUserStoreByPath
 * @param {() => void} deps.refreshWriterRuntime
 * @param {(dbPath: string) => string} deps.normalizeNestedQuarterDbPath
 * @param {(dbPath: string) => object} deps.getDbStorageLayoutFromPath
 * @param {(username: string) => boolean} deps.canManageDatabase
 * @param {(enabled: boolean) => void} [deps.setDevToolsAccessEnabled]
 * @returns {void}
 */
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

  /** Base — `system:getDbConfig` : masque `dbPath` sans session authentifiée. */
  handleIpc("system:getDbConfig", (payload) => {
    const cfg = getDbConfig();
    const ctx = getOptionalAuthContext(payload);
    if (!ctx) {
      return { configured: cfg.configured, dbPath: null, isDev: cfg.isDev };
    }
    return cfg;
  });

  /** Base — `system:listDatabases` : liste vide / sans chemins si non connecté. */
  handleIpc("system:listDatabases", (payload) => {
    const listing = listAvailableDatabases();
    const ctx = getOptionalAuthContext(payload);
    if (!ctx) {
      return { activeDbPath: null, sourceDbPath: null, archiveSession: null, items: [] };
    }
    return listing;
  });

  /** Base — `system:switchDatabase` : bascule active (RBAC dans `databaseAdmin`). */
  handleIpcAuth("system:switchDatabase", ({ dbPath, requesterRole, requesterUsername }) =>
    switchActiveDatabase(dbPath, { requesterRole, requesterUsername })
  );

  /** Archivage — `system:getArchiveStatus` : runtime + délais ; `dbPath` masqué sans session. */
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

  /** Archivage — `system:runArchiveNow` : déclenchement manuel (directeur / responsable station / DEV). */
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

  /** Writer — `system:getWriterStatus` : rôle, connectivité master/backup, chemins logs. */
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

  /**
   * DevTools — `system:setDevToolsEnabled` : activation réservée au rôle `DEV` ;
   * désactivation possible sans session.
   */
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

  /** Writer — `system:generateWriterConfig` : génération fichier config + audit `DATA_WRITER_CONFIG_GENERATED`. */
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

  /** Modèles Word — lecture, liste, installation, assignations scopées, ouverture dossier `templates`. */
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

  /** Logs writer — `system:openWriterLogFolder` : ouvre le dossier logs (repli `userData/logs`). */
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

  /** Santé BDD — `system:getDbHealth` : `writable` false sans session même si base configurée. */
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

  /**
   * Fenêtre / cycle de vie — `system:quitApp` et `system:minimizeApp` sans auth
   * (écran de connexion, équivalent barre de titre ; minimize peut masquer vers le tray).
   */
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

  /**
   * Premier paramétrage / changement base — `system:chooseDbPath` :
   * dialogue fichier, copie vers `gts-active`, persistance config et rechargement store/writer.
   * Si une base est déjà configurée, exige session + `canManageDatabase`.
   */
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
