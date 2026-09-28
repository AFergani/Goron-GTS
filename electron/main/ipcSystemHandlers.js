/**
 * Enregistrement des canaux IPC système (`system:*`) : PostgreSQL, modèles Word, fenêtre.
 *
 * Appelé depuis `main.js` ; exposé au renderer par `preload.js` / `gtsApiClient`.
 *
 * @module electron/main/ipcSystemHandlers
 */

const { probePostgresLabMonitored } = require("../store/persistence");

/**
 * Enregistre les handlers IPC système.
 *
 * @param {object} deps
 * @param {Function} deps.handleIpc
 * @param {Function} deps.handleIpcAuth
 * @param {Function} deps.handleIpcAuthLarge
 * @param {(payload?: object) => object|null} deps.getOptionalAuthContext
 * @param {() => { configured: boolean, isDev: boolean }} deps.getDbConfig
 * @param {() => import('../userStore')|null} deps.getUserStore
 * @param {object} deps.documentTemplates
 * @param {{ saveExportFile: Function, openExportFile: Function }} deps.exportFileService
 * @param {import('electron').Shell} deps.shell
 * @param {import('electron').App} deps.app
 * @param {(value: boolean) => void} deps.setIsAppQuitting
 * @param {() => import('electron').BrowserWindow|null} deps.getMainWindow
 * @param {(username: string) => boolean} deps.canManageDatabase
 * @param {(enabled: boolean) => void} deps.setDevToolsAccessEnabled
 * @param {object} deps.postgresAdmin
 * @param {object} deps.postgresBackup
 * @returns {void}
 */
function registerSystemIpcHandlers(deps) {
  const {
    handleIpc,
    handleIpcAuth,
    handleIpcAuthLarge,
    getOptionalAuthContext,
    getDbConfig,
    getUserStore,
    documentTemplates,
    exportFileService,
    shell,
    app,
    setIsAppQuitting,
    getMainWindow,
    canManageDatabase,
    setDevToolsAccessEnabled,
    postgresAdmin,
    postgresBackup
  } = deps;

  handleIpc("system:getDbConfig", () => getDbConfig());

  handleIpc("system:setDevToolsEnabled", (payload = {}) => {
    const requestedEnabled = Boolean(payload?.enabled);
    if (!requestedEnabled) {
      setDevToolsAccessEnabled(false);
      return { success: true, enabled: false };
    }
    const ctx = getOptionalAuthContext(payload);
    if (!ctx || ctx.role !== "DEV") {
      throw new Error("Accès refusé: seuls les comptes Admin peuvent activer les DevTools.");
    }
    setDevToolsAccessEnabled(true);
    return { success: true, enabled: true };
  });

  handleIpcAuth("system:getDocumentTemplate", ({ templateName }) => documentTemplates.getDocumentTemplate(templateName));
  handleIpcAuth("system:listDocumentTemplates", () => documentTemplates.listDocumentTemplatesPayload());
  handleIpcAuth("system:installDocumentTemplateCopy", (payload) => documentTemplates.installDocumentTemplateCopy(payload));
  handleIpcAuth("system:listTemplateAssignments", (payload) => getUserStore().listTemplateAssignments(payload));
  handleIpcAuth("system:upsertScopedDocumentTemplate", (payload) => documentTemplates.upsertScopedDocumentTemplate(payload));
  handleIpcAuth("system:deleteCustomDocumentTemplate", (payload) => documentTemplates.deleteCustomDocumentTemplate(payload));
  handleIpcAuth("system:restoreBuiltinDocumentTemplate", (payload) => documentTemplates.restoreBuiltinDocumentTemplate(payload));
  handleIpcAuth("system:deleteTemplateAssignment", async (payload) => {
    const result = await getUserStore().deleteTemplateAssignment(payload);
    const fileName = String(result?.templateFileName || "").trim();
    if (fileName) {
      await documentTemplates.deleteCustomTemplateFileIfUnreferenced({
        requesterRole: payload.requesterRole,
        targetFileName: fileName
      });
    }
    return result;
  });
  handleIpcAuth("system:resolveTemplateFileForContext", (payload) => getUserStore().resolveTemplateFileForContext(payload));
  handleIpcAuth("system:openTemplatesFolder", (payload) => {
    try {
      getUserStore().ensureDataManagerRole(payload.requesterRole);
      const dir = documentTemplates.resolveWritableTemplatesDirectory();
      return shell.openPath(dir).then((error) => ({ success: !error, path: dir, error: error || null }));
    } catch (e) {
      return Promise.resolve({
        success: false,
        path: null,
        error: e instanceof Error ? e.message : "Dossier des modèles indisponible."
      });
    }
  });

  handleIpcAuthLarge("system:saveExportFile", (payload) => exportFileService.saveExportFile(payload));
  handleIpcAuth("system:openExportFile", (payload) => exportFileService.openExportFile(payload));

  handleIpc("system:getDbHealth", (payload) => {
    const store = getUserStore();
    if (!store) {
      return { configured: false, writable: false };
    }
    const ctx = getOptionalAuthContext(payload);
    if (!ctx) {
      return { configured: true, writable: false };
    }
    return { configured: true, writable: Boolean(store.getDbHealth().writable) };
  });

  handleIpcAuth("system:getPostgresLabHealth", async () => {
    const store = getUserStore();
    const result = await probePostgresLabMonitored();
    const reachable = Boolean(result?.reachable);
    if (!store) {
      return result;
    }
    if (!reachable) {
      store.setAuditPostgresReachable(false);
      return result;
    }
    if (result?.transition === "restored") {
      void store.attachPostgresAuditLab({ forceReconnect: true }).catch(() => {});
      return result;
    }
    store.setAuditPostgresReachable(true);
    return result;
  });

  handleIpc("system:getPostgresBootstrapStatus", async () => postgresAdmin.getBootstrapStatus());
  handleIpc("system:savePostgresBootstrapConfig", async (payload = {}) => postgresAdmin.saveBootstrapConfig(payload || {}));
  handleIpc("system:testPostgresBootstrapConfig", async (payload = {}) => postgresAdmin.testBootstrapConfig(payload || {}));

  handleIpcAuth("system:getPostgresConfig", (payload = {}) => {
    if (!canManageDatabase(payload?.requesterUsername)) {
      throw new Error("Droits insuffisants pour consulter la configuration PostgreSQL.");
    }
    return postgresAdmin.getPublicConfig();
  });

  handleIpcAuth("system:savePostgresConfig", async (payload = {}) => postgresAdmin.saveConfig(payload));

  handleIpcAuth("system:testPostgresConfig", async (payload = {}) => {
    if (!canManageDatabase(payload?.requesterUsername)) {
      throw new Error("Droits insuffisants pour tester la connexion PostgreSQL.");
    }
    return postgresAdmin.testConfig(payload);
  });

  handleIpcAuth("system:reconnectPostgres", async (payload = {}) => {
    if (!canManageDatabase(payload?.requesterUsername)) {
      throw new Error("Droits insuffisants pour reconnecter PostgreSQL.");
    }
    return postgresAdmin.reconnect();
  });

  handleIpcAuth("system:getPostgresBackupStatus", () => postgresBackup.getStatus());
  handleIpcAuth("system:pickPostgresBackupFolder", (payload = {}) => postgresBackup.pickFolder(payload));
  handleIpcAuth("system:savePostgresBackupSettings", (payload = {}) => postgresBackup.saveSettings(payload));
  handleIpcAuth("system:openPostgresBackupFolder", (payload = {}) => {
    if (!canManageDatabase(payload?.requesterUsername)) {
      throw new Error("Droits insuffisants pour ouvrir le dossier de sauvegarde.");
    }
    return postgresBackup.openFolder();
  });
  handleIpcAuth("system:runPostgresBackup", (payload = {}) => postgresBackup.runManualDump(payload));
  handleIpcAuth("system:runPostgresBackupSaveAs", (payload = {}) => postgresBackup.runManualDumpSaveAs(payload));
  handleIpcAuth("system:startPostgresBackupCycle", (payload = {}) => postgresBackup.startBackupCycle(payload));
  handleIpcAuth("system:pickPostgresBackupFile", () => postgresBackup.pickDumpFile());
  handleIpcAuth("system:restorePostgresBackupAuth", (payload = {}) => postgresBackup.restoreBackup(payload));
  handleIpcAuth("system:comparePostgresBackupAuth", (payload = {}) => postgresBackup.compareBackup(payload));

  handleIpc("system:quitApp", () => {
    setIsAppQuitting(true);
    app.quit();
    return { success: true };
  });

  handleIpc("system:minimizeApp", () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return { success: false };
    if (!mainWindow.isMinimized()) {
      mainWindow.minimize();
    }
    return { success: true };
  });
}

module.exports = {
  registerSystemIpcHandlers
};
