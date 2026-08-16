/**
 * Enregistrement des canaux IPC système (`system:*`) : santé store / PostgreSQL,
 * modèles Word, fenêtre applicative et configuration poste.
 *
 * Instancié via `registerSystemIpcHandlers` dans `main.js` ; exposé au renderer par `preload.js` / `gtsApiClient`.
 * Plusieurs canaux acceptent un `sessionToken` optionnel et masquent les données sensibles sans session valide.
 * Plus de sélection de fichier `.db` (`chooseDbPath` retiré) ni d'archives SQLite.
 */

/**
 * Enregistre tous les handlers IPC système.
 *
 * @param {object} deps - Injections groupées depuis `main.js`.
 * @param {Function} deps.handleIpc - IPC sans authentification obligatoire (session optionnelle).
 * @param {Function} deps.handleIpcAuth - IPC avec `requesterRole` / `requesterUsername`.
 * @param {(payload?: object) => object|null} deps.getOptionalAuthContext - Valide `sessionToken` si présent.
 * @param {() => object} deps.getDbConfig - Config poste (`databaseAdmin`).
 * @param {() => void} deps.ensureStore
 * @param {() => import('../userStore')} deps.getUserStore
 * @param {object} deps.documentTemplates - Service modèles Word (`documentTemplates.js`).
 * @param {import('fs')} deps.fs
 * @param {import('electron').Shell} deps.shell - Ouverture dossiers dans l'OS.
 * @param {import('electron').App} deps.app
 * @param {(value: boolean) => void} [deps.setIsAppQuitting]
 * @param {() => import('electron').BrowserWindow|null} [deps.getMainWindow]
 * @param {() => boolean} [deps.shouldEnableTrayBackgroundMode]
 * @param {() => void} [deps.setupTrayIfNeeded]
 * @param {(username: string) => boolean} deps.canManageDatabase
 * @param {(enabled: boolean) => void} [deps.setDevToolsAccessEnabled]
 * @param {object} deps.postgresAdmin - Service config PG chiffrée (`postgresAdminService`).
 * @returns {void}
 */
function registerSystemIpcHandlers(deps) {
  const {
    handleIpc,
    handleIpcAuth,
    getOptionalAuthContext,
    getDbConfig,
    ensureStore,
    getUserStore,
    documentTemplates,
    fs,
    shell,
    app,
    setIsAppQuitting,
    getMainWindow,
    shouldEnableTrayBackgroundMode,
    setupTrayIfNeeded,
    canManageDatabase,
    setDevToolsAccessEnabled,
    postgresAdmin
  } = deps;

  /** Poste — `system:getDbConfig` : masque `dbPath` sans session authentifiée. */
  handleIpc("system:getDbConfig", (payload) => {
    const cfg = getDbConfig();
    const ctx = getOptionalAuthContext(payload);
    if (!ctx) {
      return { configured: cfg.configured, dbPath: null, isDev: cfg.isDev };
    }
    return cfg;
  });

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

  /** Santé BDD — `system:getDbHealth` : `writable` false sans session même si store configuré. */
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
   * Sonde labo PostgreSQL — `system:getPostgresLabHealth` (badge temporaire « PG »).
   * Journalise dans `error_logs` uniquement les transitions (perte / reconnexion), pas le poll.
   */
  handleIpcAuth("system:getPostgresLabHealth", async () => {
    const { probePostgresLabMonitored } = require("../store/persistence");
    const store = getUserStore();
    const result = await probePostgresLabMonitored({
      logError: store
        ? (entry) => {
            try {
              store.logError(entry);
            } catch {
              // Ne jamais faire échouer le badge si le journal technique est indisponible.
            }
          }
        : null
    });
    const reachable = Boolean(result?.reachable);
    if (!store) {
      return result;
    }
    if (!reachable) {
      if (typeof store.setAuditPostgresReachable === "function") {
        store.setAuditPostgresReachable(false);
      }
      return result;
    }
    // Reconnexion après panne : nouveau pool (one-shot labo si besoin).
    if (result?.transition === "restored" && typeof store.attachPostgresAuditLab === "function") {
      void store.attachPostgresAuditLab({ forceReconnect: true }).catch((error) => {
        try {
          store.logError({
            source: "audit:migrate",
            code: "AUDIT_PG_COPY_FAILED",
            messageFr: "Reconnecter PostgreSQL après panne impossible.",
            details: { reason: error instanceof Error ? error.message : String(error || "") }
          });
        } catch {
          // ignore
        }
      });
      return result;
    }
    if (typeof store.setAuditPostgresReachable === "function") {
      store.setAuditPostgresReachable(true);
    }
    return result;
  });

  /**
   * Bootstrap PG (sans session) — premier paramétrage avant login.
   * `system:getPostgresBootstrapStatus` / `savePostgresBootstrapConfig` / `testPostgresBootstrapConfig`.
   */
  handleIpc("system:getPostgresBootstrapStatus", () => postgresAdmin.getBootstrapStatus());

  handleIpc("system:savePostgresBootstrapConfig", async (payload = {}) => {
    return postgresAdmin.saveBootstrapConfig(payload || {});
  });

  handleIpc("system:testPostgresBootstrapConfig", async (payload = {}) => {
    return postgresAdmin.testBootstrapConfig(payload || {});
  });

  /**
   * Config PostgreSQL publique (sans mot de passe) — `system:getPostgresConfig`.
   * Réservé aux profils autorisés à gérer la base.
   */
  handleIpcAuth("system:getPostgresConfig", (payload = {}) => {
    if (!canManageDatabase(payload?.requesterUsername)) {
      throw new Error("Droits insuffisants pour consulter la configuration PostgreSQL.");
    }
    return postgresAdmin.getPublicConfig();
  });

  /**
   * Enregistrement config PG chiffrée + reconnexion — `system:savePostgresConfig`.
   */
  handleIpcAuth("system:savePostgresConfig", async (payload = {}) => {
    return postgresAdmin.saveConfig(payload);
  });

  /**
   * Test de connexion PG (brouillon ou config courante) — `system:testPostgresConfig`.
   */
  handleIpcAuth("system:testPostgresConfig", async (payload = {}) => {
    if (!canManageDatabase(payload?.requesterUsername)) {
      throw new Error("Droits insuffisants pour tester la connexion PostgreSQL.");
    }
    return postgresAdmin.testConfig(payload);
  });

  /**
   * Force la réouverture du pool PG — `system:reconnectPostgres`.
   */
  handleIpcAuth("system:reconnectPostgres", async (payload = {}) => {
    if (!canManageDatabase(payload?.requesterUsername)) {
      throw new Error("Droits insuffisants pour reconnecter PostgreSQL.");
    }
    return postgresAdmin.reconnect();
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
}

module.exports = {
  registerSystemIpcHandlers
};
