const path = require("path");
const fs = require("fs");
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require("electron");

// Même dossier userData en dev (goron-gts) et en installé (productName « Goron GTS »).
app.setPath("userData", path.join(app.getPath("appData"), "goron-gts"));

const { UserStore, AppError } = require("./userStore");
const sessionMain = require("./store/core/session");
const { createDocumentTemplatesService } = require("./main/documentTemplates");
const { createExportFileService } = require("./main/exportFileService");
const { createPostgresAdminService } = require("./main/postgresAdminService");
const { createPostgresBackupService } = require("./main/postgresBackupService");
const { createAppConfigService } = require("./main/appConfigService");
const { createWindowService } = require("./main/windowService");
const { registerAuthIpcHandlers } = require("./main/ipcAuthHandlers");
const { registerDomainIpcHandlers } = require("./main/ipcDomainHandlers");
const { registerSystemIpcHandlers } = require("./main/ipcSystemHandlers");

/**
 * Point d'entrée du processus principal Electron (Goron-GTS).
 *
 * Rôle : orchestrer le cycle de vie de l'application, le store applicatif
 * (`UserStore` / PostgreSQL connexion directe, badge DB), les planificateurs
 * (clôture auto gardiennage/rondes, sauvegardes PG) et le pont IPC vers le renderer.
 *
 * Boot PostgreSQL-only : connexion directe au serveur, badge DB.
 * La logique détaillée vit dans `electron/main/*` ; ce fichier
 * compose les services, tient l'état mutable (`userStore`) et enregistre les handlers IPC.
 *
 * @module electron/main
 */

/**
 * Erreurs PG « attendues » quand le serveur coupe une connexion idle (docker stop, reload).
 * Sans interception, Electron affiche la boîte Windows « Uncaught Exception ».
 *
 * @param {unknown} error
 * @returns {boolean}
 */
function isBenignPostgresDisconnect(error) {
  const code = String(error && typeof error === "object" && "code" in error ? error.code : "");
  const message = error instanceof Error ? error.message : String(error || "");
  if (code === "57P01" || code === "57P02" || code === "57P03") return true;
  return /terminating connection due to administrator command/i.test(message)
    || /Connection terminated unexpectedly/i.test(message)
    || /server closed the connection unexpectedly/i.test(message)
    || /ECONNRESET/i.test(message)
    || /ECONNREFUSED/i.test(message)
    || /Connection terminated/i.test(message);
}

process.on("uncaughtException", (error) => {
  if (isBenignPostgresDisconnect(error)) {
    console.warn("[postgres] Exception idle ignorée (pas de boîte Windows):", error instanceof Error ? error.message : error);
    try {
      if (userStore && typeof userStore.setAuditPostgresReachable === "function") {
        userStore.setAuditPostgresReachable(false);
      }
    } catch {
      // ignore
    }
    return;
  }
  console.error("[main] uncaughtException:", error);
});

process.on("unhandledRejection", (reason) => {
  if (isBenignPostgresDisconnect(reason)) {
    console.warn("[postgres] Rejection idle ignorée:", reason instanceof Error ? reason.message : reason);
    try {
      if (userStore && typeof userStore.setAuditPostgresReachable === "function") {
        userStore.setAuditPostgresReachable(false);
      }
    } catch {
      // ignore
    }
    return;
  }
  console.error("[main] unhandledRejection:", reason);
});

const isDev = !app.isPackaged;
const appConfigPath = path.join(app.getPath("userData"), "app-config.json");
const GARDIENNAGE_AUTO_CLOSE_INTERVAL_MS = 5 * 60 * 1000;
let userStore = null;
let mainWindow = null;
let isAppQuitting = false;
let devToolsAccessEnabled = false;

const appConfigService = createAppConfigService({ fs, appConfigPath });
const readAppConfig = appConfigService.readAppConfig;
const writeAppConfig = appConfigService.writeAppConfig;

/**
 * Instancie ou réinstancie `UserStore` (PostgreSQL-only).
 * Invalide les sessions uniquement lors d'une réinitialisation après un store déjà présent.
 * Branche en arrière-plan le pilote PostgreSQL (no-op soft si PG down).
 *
 * @returns {void}
 */
function initUserStore() {
  const hadStore = Boolean(userStore);
  if (hadStore) {
    sessionMain.clearAllSessions();
  }
  if (userStore && typeof userStore.close === "function") {
    void userStore.close().catch(() => {});
  }
  userStore = new UserStore({
    isPackaged: app.isPackaged,
    userDataPath: app.getPath("userData")
  });
  // Attente possible via `userStore.whenPostgresReady()` (login / comptes).
  userStore._pgAttachPromise = userStore.attachPostgresAuditLab().catch(() => ({ attached: false }));
}

/**
 * Droit de gérer la connexion PostgreSQL (DEV, directeur ou responsable de station).
 *
 * @param {string} requesterUsername
 * @returns {boolean}
 */
function canManageDatabase(requesterUsername) {
  if (!userStore) return false;
  return Boolean(userStore.canManagePostgresConfig(requesterUsername));
}

/**
 * Racine unique des modèles Word : le dossier de données Electron de l'application.
 *
 * @returns {string[]}
 */
function getDataRootCandidates() {
  return [app.getPath("userData")];
}

const documentTemplates = createDocumentTemplatesService({
  fs,
  path,
  dialog,
  appDirname: __dirname,
  processCwd: process.cwd(),
  getDataRootCandidates,
  ensureStore,
  getUserStore: () => userStore
});

const exportFileService = createExportFileService({
  fs,
  path,
  dialog,
  shell,
  app,
  getMainWindow: () => mainWindow
});

const postgresAdmin = createPostgresAdminService({
  getUserStore: () => userStore,
  canManageDatabase
});

const postgresBackup = createPostgresBackupService({
  dialog,
  shell,
  app,
  getMainWindow: () => mainWindow,
  getUserStore: () => userStore,
  canManageDatabase,
  postgresAdmin
});

/**
 * Indicateurs de boot du poste (pas un diagnostic PostgreSQL).
 * - `configured` : `UserStore` instancié (après `initUserStore`).
 * - `isDev` : appli non packagée (restauration de session locale côté renderer).
 *
 * @returns {{ configured: boolean, isDev: boolean }}
 */
function getDbConfig() {
  return {
    configured: Boolean(userStore),
    isDev: Boolean(isDev)
  };
}

function ensureStore() {
  if (!userStore) {
    throw new Error("Le store applicatif n'est pas initialisé.");
  }
}

let gardiennageAutoCloseTimer = null;

function runBackgroundAutoCloseTick() {
  try {
    ensureStore();
    void Promise.all([
      userStore.extendOpenEndedGardiennageHorizons(),
      userStore.autoCloseExpiredGardiennages(),
      userStore.autoCloseExpiredExceptionalRondes()
    ]).catch(() => {
      // Tick silencieux si PG / store pas encore prêts.
    });
  } catch {
    // Tick silencieux si le store n'est pas encore prêt.
  }
}

function stopGardiennageAutoCloseScheduler() {
  if (gardiennageAutoCloseTimer) {
    clearInterval(gardiennageAutoCloseTimer);
    gardiennageAutoCloseTimer = null;
  }
}

function startGardiennageAutoCloseScheduler() {
  stopGardiennageAutoCloseScheduler();
  const tick = () => runBackgroundAutoCloseTick();
  void tick();
  gardiennageAutoCloseTimer = setInterval(tick, GARDIENNAGE_AUTO_CLOSE_INTERVAL_MS);
}


const windowService = createWindowService({
  BrowserWindow,
  Menu,
  path,
  isDev,
  readAppConfig,
  writeAppConfig,
  getIsDevToolsAllowed: () => isDev || devToolsAccessEnabled,
  getIsAppQuitting: () => isAppQuitting,
  setMainWindow: (win) => {
    mainWindow = win;
  },
  baseDirname: __dirname,
  app
});
function createWindow() {
  return windowService.createWindow();
}

/** Taille maximale d'un payload IPC sérialisé (512 Ko). */
const IPC_MAX_PAYLOAD_BYTES = 512 * 1024;

function checkIpcPayloadSize(payload) {
  if (payload === null || payload === undefined) return;
  try {
    const serialized = JSON.stringify(payload);
    if (serialized.length > IPC_MAX_PAYLOAD_BYTES) {
      throw new Error(`Payload IPC trop volumineux (${serialized.length} octets, max ${IPC_MAX_PAYLOAD_BYTES}).`);
    }
  } catch (err) {
    if (err.message.includes("Payload IPC")) throw err;
    // Payload non sérialisable : on laisse passer (géré plus bas).
  }
}

function mapTechnicalErrorToFrenchMessage(error) {
  const fallback = "Une erreur technique est survenue. Merci de reessayer.";
  const rawMessage =
    error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "";
  const code = error && typeof error === "object" && typeof error.code === "string" ? error.code : "";
  if (!rawMessage && !code) return fallback;
  const normalized = rawMessage.toLowerCase();
  if (
    code === "EBUSY" ||
    normalized.includes("ebusy") ||
    normalized.includes("resource busy or locked") ||
    normalized.includes("being used by another process")
  ) {
    return "Fichier déjà ouvert. Fermez-le dans Word ou Excel, puis réessayez.";
  }
  if (
    (code === "EACCES" || code === "EPERM" || normalized.includes("eacces") || normalized.includes("eperm")) &&
    /,\s*open\s+'/i.test(rawMessage)
  ) {
    return "Impossible d'enregistrer : accès refusé. Fermez le fichier s'il est ouvert, ou choisissez un autre emplacement.";
  }
  if (
    normalized.includes("connection terminated") ||
    normalized.includes("econnrefused") ||
    normalized.includes("enotfound") ||
    normalized.includes("timeout") ||
    normalized.includes("57p01") ||
    normalized.includes("57p03")
  ) {
    return "Le serveur PostgreSQL n'est pas joignable. Réessayez après le retour du service.";
  }
  return rawMessage;
}

/**
 * Enregistre un handler IPC sans session (limite taille payload, messages FR, `AppError`).
 *
 * @param {string} channel
 * @param {(payload: unknown) => Promise<unknown>} fn
 */
function handleIpc(channel, fn) {
  ipcMain.handle(channel, async (_, payload) => {
    try {
      checkIpcPayloadSize(payload);
      return await fn(payload);
    } catch (error) {
      if (error instanceof AppError) {
        throw new Error(error.userMessage);
      }
      throw new Error(mapTechnicalErrorToFrenchMessage(error));
    }
  });
}

/**
 * Valide `sessionToken` et enrichit le payload avec rôle / profil manager.
 *
 * @param {object} payload
 */
function attachAuthContext(payload) {
  const base = payload && typeof payload === "object" ? payload : {};
  const token = base.sessionToken;
  const ctx = sessionMain.validateSession(token, userStore);
  if (!ctx) {
    throw new Error("SESSION_INVALID: Session invalide. Reconnectez-vous.");
  }
  if (ctx.unavailable) {
    throw new Error("Le serveur PostgreSQL n'est pas joignable. Réessayez après le retour du service.");
  }
  if (ctx.expired) {
    throw new Error("SESSION_EXPIRED: Votre session a expiré (limite 13h). Reconnectez-vous.");
  }
  return {
    ...base,
    requesterUsername: ctx.username,
    requesterRole: ctx.role,
    requesterManagerProfile: ctx.managerProfile
  };
}

/**
 * Handler IPC authentifié (`ensureStore` + `attachAuthContext`).
 *
 * @param {string} channel
 * @param {(payload: object) => Promise<unknown>} fn
 */
function handleIpcAuth(channel, fn) {
  ipcMain.handle(channel, async (_, payload) => {
    try {
      checkIpcPayloadSize(payload);
      ensureStore();
      const merged = attachAuthContext(payload);
      return await fn(merged);
    } catch (error) {
      if (error instanceof AppError) {
        throw new Error(error.userMessage);
      }
      throw new Error(mapTechnicalErrorToFrenchMessage(error));
    }
  });
}

/**
 * Handler authentifié sans limite JSON 512 Ko (payload binaire : bytes d’un export).
 * La taille est bornée dans `exportFileService` (40 Mo).
 *
 * @param {string} channel
 * @param {(payload: object) => Promise<unknown>} fn
 */
function handleIpcAuthLarge(channel, fn) {
  ipcMain.handle(channel, async (_, payload) => {
    try {
      ensureStore();
      const merged = attachAuthContext(payload);
      return await fn(merged);
    } catch (error) {
      if (error instanceof AppError) {
        throw new Error(error.userMessage);
      }
      throw new Error(mapTechnicalErrorToFrenchMessage(error));
    }
  });
}

function getOptionalAuthContext(payload) {
  const token = payload && typeof payload === "object" ? payload.sessionToken : null;
  if (!token || !userStore) return null;
  const ctx = sessionMain.validateSession(token, userStore);
  if (!ctx || ctx.expired || ctx.unavailable) return null;
  return ctx;
}

registerSystemIpcHandlers({
  handleIpc,
  handleIpcAuth,
  handleIpcAuthLarge,
  getOptionalAuthContext,
  getDbConfig,
  getUserStore: () => userStore,
  documentTemplates,
  exportFileService,
  shell,
  app,
  setIsAppQuitting: (value) => {
    isAppQuitting = value;
  },
  getMainWindow: () => mainWindow,
  canManageDatabase,
  setDevToolsAccessEnabled: (enabled) => {
    devToolsAccessEnabled = Boolean(enabled);
  },
  postgresAdmin,
  postgresBackup
});

registerAuthIpcHandlers({
  handleIpc,
  handleIpcAuth,
  ensureStore,
  getUserStore: () => userStore,
  createSession: sessionMain.createSession,
  revokeSession: sessionMain.revokeSession
});
registerDomainIpcHandlers({
  handleIpcAuth,
  getUserStore: () => userStore,
  getActiveUsernames: sessionMain.getActiveUsernames
});

/** Démarrage : sessions persistées, store PG, fenêtre. */
app.whenReady().then(async () => {
  // Windows : associe la fenêtre à l'icône Goron-GTS dans la barre des tâches.
  if (process.platform === "win32") {
    app.setAppUserModelId("com.goron.gts");
  }
  await postgresAdmin.tryAutoPersistLabDefaultsIfMissing();
  // Supprime la barre de menu globalement (toutes les fenêtres de l'application).
  Menu.setApplicationMenu(null);
  sessionMain.loadPersistedSessions();
  initUserStore();
  startGardiennageAutoCloseScheduler();
  postgresBackup.startScheduler();
  createWindow();
});

app.on("window-all-closed", () => {
  stopGardiennageAutoCloseScheduler();
  postgresBackup.stopScheduler();
  // Windows/Linux : dernière fenêtre fermée = quitter.
  if (process.platform !== "darwin") app.quit();
});
