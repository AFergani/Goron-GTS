const path = require("path");
const fs = require("fs");
const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu } = require("electron");
const { UserStore, AppError } = require("./userStore");
const sessionMain = require("./store/core/session");
const { writeEncryptedAdminCode, ADMIN_ENC_FILE_NAME } = require("./store/core/adminAccess");
const { createDocumentTemplatesService } = require("./main/documentTemplates");
const { createDatabaseAdminService } = require("./main/databaseAdmin");
const { createPostgresAdminService } = require("./main/postgresAdminService");
const { createAppConfigService } = require("./main/appConfigService");
const { createTrayService } = require("./main/trayService");
const { createDbAccessControlService } = require("./main/dbAccessControl");
const { createWindowService } = require("./main/windowService");
const { registerAuthIpcHandlers } = require("./main/ipcAuthHandlers");
const { registerDomainIpcHandlers } = require("./main/ipcDomainHandlers");
const { registerSystemIpcHandlers } = require("./main/ipcSystemHandlers");

/**
 * Point d'entrée du processus principal Electron (Goron-GTS).
 *
 * Rôle : orchestrer le cycle de vie de l'application, le store applicatif
 * (`UserStore` / PostgreSQL connexion directe, badge DB), les planificateurs
 * (clôture auto gardiennage/rondes) et le pont IPC vers le renderer.
 *
 * Boot PostgreSQL-only : plus de fichier `store.db` / SQLite métier, plus de pont
 * writer Master/Backup. La logique détaillée vit dans `electron/main/*` ; ce fichier
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

const trayService = createTrayService({
  path,
  app,
  Tray,
  Menu,
  iconDirname: __dirname,
  getMainWindow: () => mainWindow,
  setIsAppQuitting: (value) => {
    isAppQuitting = value;
  }
});
const dbAccessControlService = createDbAccessControlService({
  getUserStore: () => userStore
});
function shouldEnableTrayBackgroundMode() {
  return trayService.shouldEnableTrayBackgroundMode();
}
function ensureAppTray() {
  return trayService.ensureAppTray();
}
function refreshTrayMenu() {
  return trayService.refreshTrayMenu();
}
function setupTrayIfNeeded() {
  return trayService.setupTrayIfNeeded();
}

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

/** Vérifie que l'utilisateur peut modifier la configuration de la base de données. */
function canManageDatabase(requesterUsername) {
  return dbAccessControlService.canManageDatabase(requesterUsername);
}

/**
 * Racines `data/` candidates pour modèles Word et assets locaux (sans fichier `.db`).
 *
 * @returns {string[]}
 */
function getDataRootCandidates() {
  const exeDir = path.dirname(app.getPath("exe"));
  const exeParentDir = path.dirname(exeDir);
  const exeGrandParentDir = path.dirname(exeParentDir);
  const portableExeDir = process.env.PORTABLE_EXECUTABLE_DIR || null;
  const portableExeParentDir = portableExeDir ? path.dirname(portableExeDir) : null;
  const portableExeGrandParentDir = portableExeParentDir ? path.dirname(portableExeParentDir) : null;
  const preferredRoot = !app.isPackaged
    ? path.join(process.cwd(), "data")
    : portableExeDir
      ? path.join(portableExeDir, "data")
      : path.join(app.getPath("userData"), "data");
  const candidates = [
    preferredRoot,
    path.join(process.cwd(), "data"),
    path.join(app.getPath("userData"), "data"),
    path.join(exeDir, "data"),
    path.join(exeParentDir, "data"),
    path.join(exeGrandParentDir, "data"),
    portableExeDir ? path.join(portableExeDir, "data") : null,
    portableExeParentDir ? path.join(portableExeParentDir, "data") : null,
    portableExeGrandParentDir ? path.join(portableExeGrandParentDir, "data") : null
  ];
  return [...new Set(candidates.filter(Boolean))];
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

const databaseAdmin = createDatabaseAdminService({
  isDev,
  isStoreReady: () => Boolean(userStore)
});

const postgresAdmin = createPostgresAdminService({
  getUserStore: () => userStore,
  canManageDatabase
});

function getDbConfig() {
  return databaseAdmin.getDbConfig();
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
  setupTrayIfNeeded,
  getIsDevToolsAllowed: () => isDev || devToolsAccessEnabled,
  getIsAppQuitting: () => isAppQuitting,
  setMainWindow: (win) => {
    mainWindow = win;
  },
  baseDirname: __dirname
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
  if (!rawMessage) return fallback;
  const normalized = rawMessage.toLowerCase();
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

function getOptionalAuthContext(payload) {
  const token = payload && typeof payload === "object" ? payload.sessionToken : null;
  if (!token || !userStore) return null;
  const ctx = sessionMain.validateSession(token, userStore);
  if (!ctx || ctx.expired) return null;
  return ctx;
}

registerSystemIpcHandlers({
  handleIpc,
  handleIpcAuth,
  getOptionalAuthContext,
  getDbConfig,
  ensureStore,
  getUserStore: () => userStore,
  documentTemplates,
  fs,
  shell,
  app,
  setIsAppQuitting: (value) => {
    isAppQuitting = value;
  },
  getMainWindow: () => mainWindow,
  shouldEnableTrayBackgroundMode,
  setupTrayIfNeeded,
  canManageDatabase,
  setDevToolsAccessEnabled: (enabled) => {
    devToolsAccessEnabled = Boolean(enabled);
  },
  postgresAdmin
});

registerAuthIpcHandlers({
  handleIpc,
  handleIpcAuth,
  ensureStore,
  getUserStore: () => userStore,
  createSession: sessionMain.createSession,
  revokeSession: sessionMain.revokeSession,
  path,
  app,
  ADMIN_ENC_FILE_NAME,
  writeEncryptedAdminCode
});
registerDomainIpcHandlers({
  handleIpcAuth,
  ensureStore,
  getUserStore: () => userStore,
  getActiveUsernames: sessionMain.getActiveUsernames
});

/** Démarrage : sessions persistées, store PG, fenêtre. */
app.whenReady().then(() => {
  // Supprime la barre de menu globalement (toutes les fenêtres de l'application).
  Menu.setApplicationMenu(null);
  sessionMain.loadPersistedSessions();
  initUserStore();
  startGardiennageAutoCloseScheduler();
  createWindow();
});

app.on("window-all-closed", () => {
  stopGardiennageAutoCloseScheduler();
  // Windows/Linux : dernière fenêtre fermée = quitter (la réduction tray utilise hide(), pas destroy).
  if (process.platform !== "darwin") app.quit();
});
