const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");
const crypto = require("crypto");
const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu } = require("electron");
const { UserStore, AppError } = require("./userStore");
const sessionMain = require("./store/core/session");
const { writeEncryptedAdminCode, ADMIN_ENC_FILE_NAME } = require("./store/core/adminAccess");
const { createDocumentTemplatesService } = require("./main/documentTemplates");
const dbPathUtils = require("./main/dbPathUtils");
const { createDatabaseAdminService } = require("./main/databaseAdmin");
const { createAppConfigService } = require("./main/appConfigService");
const { createWriterLogsService } = require("./main/writerLogs");
const { executeQueuedAction } = require("./main/writerQueueActions");
const { createWriterQueueWorkerService } = require("./main/writerQueueWorker");
const { createWriterQueueEnqueueService } = require("./main/writerQueueEnqueue");
const { createArchiveRunnerService } = require("./main/archiveRunner");
const { createTrayService } = require("./main/trayService");
const { createDbAccessControlService } = require("./main/dbAccessControl");
const { createWriterMonitorService } = require("./main/writerMonitor");
const { createWriterHttpServerService } = require("./main/writerHttpServer");
const { createWriterContextService } = require("./main/writerContext");
const { createWriterRuntimeService } = require("./main/writerRuntime");
const { createWindowService } = require("./main/windowService");
const { registerAuthIpcHandlers } = require("./main/ipcAuthHandlers");
const { registerDomainIpcHandlers } = require("./main/ipcDomainHandlers");
const { registerSystemIpcHandlers } = require("./main/ipcSystemHandlers");

/**
 * Point d'entrée du processus principal Electron (Goron-GTS).
 *
 * Rôle : orchestrer le cycle de vie de l'application, la base SQLite (`UserStore`),
 * le runtime writer (Maître / Backup / client, HTTP ou file SMB), les planificateurs
 * (archivage trimestriel, clôture auto gardiennage/rondes) et le pont IPC vers le renderer.
 *
 * La logique détaillée vit dans `electron/main/*` ; ce fichier compose les services,
 * tient l'état mutable (`userStore`, `writerRuntime`, `archiveRuntime`) et enregistre
 * les handlers IPC (`ipcAuthHandlers`, `ipcDomainHandlers`, `ipcSystemHandlers`).
 * Exception : `mainCourante:create` reste ici (forward HTTP / queue SMB / écriture locale).
 *
 * @module electron/main
 */

const isDev = !app.isPackaged;
const appConfigPath = path.join(app.getPath("userData"), "app-config.json");
const fallbackWriterLogsDir = path.join(app.getPath("userData"), "logs");
const WRITER_LOG_MAX_FILE_BYTES = 5 * 1024 * 1024;
const WRITER_LOG_MAX_FILES = 10;
const QUEUE_ACK_RETENTION_MS = 2 * 60 * 1000;
const QUEUE_TMP_RETENTION_MS = 60 * 1000;
const ARCHIVE_LOGICAL_DELAY_DAYS = 10;
const ARCHIVE_SCHEDULER_INTERVAL_MS = 15 * 60 * 1000;
const GARDIENNAGE_AUTO_CLOSE_INTERVAL_MS = 5 * 60 * 1000;
const ARCHIVE_AUTO_MIN_DB_AGE_DAYS = 90;
/** Limite de taille du corps accepté par le serveur writer HTTP (prévention DoS). */
const WRITER_MAX_BODY_BYTES = 512 * 1024;
/** Nom de l'en-tête HMAC utilisé pour authentifier les requêtes inter-nœuds writer. */
const WRITER_SIG_HEADER = "x-gts-writer-sig";
/** Horodatage (ms epoch) signé dans le HMAC writer pour limiter le rejeu. */
const WRITER_TS_HEADER = "x-gts-writer-ts";
/** Nonce aléatoire signé dans le HMAC writer pour empêcher la réutilisation d'une requête. */
const WRITER_NONCE_HEADER = "x-gts-writer-nonce";
/** Fenêtre d'acceptation des requêtes writer signées (anti-rejeu). */
const WRITER_REPLAY_WINDOW_MS = 60 * 1000;
let userStore = null;
let mainWindow = null;
let isAppQuitting = false;
let devToolsAccessEnabled = false;
let writerRuntime = {
  enabled: false,
  role: "disabled",
  transportMode: "smb_queue",
  configPath: null,
  sharedRoot: null,
  policy: null,
  masterHost: null,
  masterPort: null,
  backupHost: null,
  backupPort: null,
  failoverEnabled: false,
  writerTimeoutMs: 15000,
  heartbeatIntervalMs: 3000,
  connectivity: {
    masterReachable: null,
    backupReachable: null
  },
  localHostname: os.hostname(),
  localWhoami: `${os.hostname()}\\${os.userInfo().username}`.toLowerCase(),
  secret: null,
  server: null
};
let archiveRuntime = {
  lastLogicalRunAt: null,
  lastLogicalResult: null,
  lastQuarterRotationAt: null,
  lastQuarterFrom: null,
  lastQuarterTo: null,
  lastError: null,
  pendingJobs: 0,
  lastArchiveBatchAt: null,
  archiveSession: {
    active: false,
    openedBy: null,
    openedAt: null,
    sourceDbPath: null,
    activeDbPath: null
  }
};
const WRITER_CONFIG_FILE_NAME = "gts_writer-config.json";
/** Ancien nom mal orthographié : conservé en repli pour les deploiements existants. */
const LEGACY_WRITER_CONFIG_MISSPELL_FILE_NAME = "gts_wrtier-config.json";
const LEGACY_WRITER_CONFIG_FILE_NAME = "writer-config.v1.json";

const trayService = createTrayService({
  path,
  app,
  Tray,
  Menu,
  iconDirname: __dirname,
  getWriterRuntime: () => writerRuntime,
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

let writerLogsService = null;
function getWriterLogsService() {
  if (!writerLogsService) {
    writerLogsService = createWriterLogsService({
      fs,
      path,
      fallbackWriterLogsDir,
      writerLogMaxFileBytes: WRITER_LOG_MAX_FILE_BYTES,
      writerLogMaxFiles: WRITER_LOG_MAX_FILES,
      readAppConfig,
      resolveWriterConfigPath
    });
  }
  return writerLogsService;
}
function getWriterLogContext() {
  return getWriterLogsService().getWriterLogContext();
}
function appendWriterTransitLog(entry) {
  return getWriterLogsService().appendWriterTransitLog(entry);
}

const writerContextService = createWriterContextService({
  path,
  fs,
  os,
  app,
  processCwd: process.cwd(),
  portableExecutableDir: process.env.PORTABLE_EXECUTABLE_DIR || null,
  readAppConfig,
  writerConfigFileName: WRITER_CONFIG_FILE_NAME,
  legacyWriterConfigMisspellFileName: LEGACY_WRITER_CONFIG_MISSPELL_FILE_NAME,
  legacyWriterConfigFileName: LEGACY_WRITER_CONFIG_FILE_NAME,
  getWriterRole: () => writerRuntime.role
});
function normalizeText(value) {
  return writerContextService.normalizeText(value);
}
function readJsonIfExists(filePath) {
  return writerContextService.readJsonIfExists(filePath);
}
function resolveWriterConfigPath() {
  return writerContextService.resolveWriterConfigPath();
}
function getLocalIPv4() {
  return writerContextService.getLocalIPv4();
}
function getLocalSourceContext() {
  return writerContextService.getLocalSourceContext();
}
function getLocalNodeIdentity() {
  return writerContextService.getLocalNodeIdentity();
}

/**
 * Construit le JSON `gts_writer-config.json` (profils prod/dev, secret HMAC, nœuds master/backup).
 *
 * @param {object} [payload]
 * @returns {object}
 */
function buildWriterConfigPayload(payload = {}) {
  const cleanNode = (node, defaultPort) => ({
    hostname: String(node?.hostname || "").trim(),
    host: String(node?.host || "").trim(),
    port: Number(node?.port || defaultPort),
    whoami: String(node?.whoami || "").trim().toLowerCase()
  });
  const cleanNumber = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  };
  const master = cleanNode(payload.master || {}, 4711);
  const backup = cleanNode(payload.backup || {}, 4811);
  if (!master.hostname || !master.host || !master.whoami) {
    throw new Error("Master incomplet: hostname, host et whoami sont obligatoires.");
  }
  if (!backup.hostname || !backup.host || !backup.whoami) {
    throw new Error("Backup incomplet: hostname, host et whoami sont obligatoires.");
  }
  return {
    version: "1.1",
    environmentProfiles: {
      production: {
        description: "Configuration opérationnelle",
        activeWriterPolicy: "master_with_backup_failover"
      },
      development: {
        description: "Développement local",
        activeWriterPolicy: "super_master_local_only",
        superMaster: master
      }
    },
    defaultProfile: String(payload.defaultProfile || "production").trim().toLowerCase() === "development" ? "development" : "production",
    network: {
      serviceSubnet: String(payload.serviceSubnet || "").trim() || "192.168.111.0/24",
      forceIPv4: payload.forceIPv4 !== false
    },
    writer: {
      // Secret HMAC-SHA256 généré automatiquement : authentifie les requêtes HTTP entre nœuds writer.
      // Ce fichier est partagé via SMB — tous les nœuds lisent le même secret automatiquement.
      secret: crypto.randomBytes(32).toString("hex"),
      master,
      backup,
      failover: {
        enabled: payload.failoverEnabled !== false,
        mode: "master_with_backup",
        heartbeatIntervalMs: cleanNumber(payload.heartbeatIntervalMs, 3000),
        writerTimeoutMs: cleanNumber(payload.writerTimeoutMs, 15000),
        retryIntervalMs: cleanNumber(payload.retryIntervalMs, 5000)
      }
    }
  };
}

/**
 * Génère le fichier de configuration writer (dialogue ou chemin fourni) et rafraîchit le runtime.
 *
 * @param {object} [payload]
 * @returns {Promise<{ success: boolean, canceled?: boolean, filePath: string|null }>}
 */
async function generateWriterConfigFile(payload = {}) {
  ensureStore();
  const appCfg = readAppConfig();
  const baseDefaultDir =
    appCfg.dbPath && fs.existsSync(appCfg.dbPath)
      ? getDbStorageLayoutFromPath(appCfg.dbPath).dataRoot
      : path.join(process.cwd(), "data");
  const defaultPath = path.join(baseDefaultDir, WRITER_CONFIG_FILE_NAME);
  const requestedPath = String(payload.outputPath || "").trim();
  let filePath = requestedPath;
  if (!filePath) {
    const picked = await dialog.showSaveDialog({
      title: "Enregistrer la configuration writer",
      defaultPath,
      filters: [{ name: "Configuration JSON", extensions: ["json"] }]
    });
    if (picked.canceled || !picked.filePath) {
      return { success: false, canceled: true, filePath: null };
    }
    filePath = picked.filePath;
  }
  const config = buildWriterConfigPayload(payload);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
  const current = readAppConfig();
  writeAppConfig({ ...current, writerConfigPath: filePath });
  refreshWriterRuntime();
  return { success: true, canceled: false, filePath };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startDeferredAckCleanup({ ackPath, requestId, source, lateAckEvent }) {
  const cleanupStartedAt = Date.now();
  const cleanupTimeoutMs = Math.max(Number(writerRuntime.writerTimeoutMs || 15000) * 4, 120000);
  const cleanupTimer = setInterval(() => {
    try {
      if (fs.existsSync(ackPath)) {
        const ack = readJsonIfExists(ackPath) || {};
        try {
          fs.unlinkSync(ackPath);
        } catch {}
        appendWriterTransitLog({
          event: lateAckEvent,
          requestId,
          source,
          writerNode: ack.writerNode || null,
          mode: "smb_queue",
          result: ack.ok ? "SUCCESS" : "ERROR"
        });
        clearInterval(cleanupTimer);
        return;
      }
      if (Date.now() - cleanupStartedAt > cleanupTimeoutMs) {
        clearInterval(cleanupTimer);
      }
    } catch {
      clearInterval(cleanupTimer);
    }
  }, 2000);
}

function safeWriteJson(filePath, data) {
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}

function getWriterQueueContext() {
  let dataRoot = null;
  if (writerRuntime.configPath) {
    const configDir = path.dirname(writerRuntime.configPath);
    if (path.basename(configDir).toLowerCase() === "data") {
      dataRoot = configDir;
    } else {
      dataRoot = path.join(path.dirname(configDir), "data");
    }
  } else if (writerRuntime.sharedRoot) {
    dataRoot = path.join(writerRuntime.sharedRoot, "data");
  }
  if (!dataRoot) return null;
  const queueRoot = path.join(dataRoot, "queue");
  return {
    queueRoot,
    incomingDir: path.join(queueRoot, "incoming"),
    processingDir: path.join(queueRoot, "processing"),
    ackDir: path.join(queueRoot, "ack"),
    heartbeatMasterFile: path.join(queueRoot, "heartbeat-master.json"),
    heartbeatBackupFile: path.join(queueRoot, "heartbeat-backup.json")
  };
}

function getWriterQueueStats() {
  const queueCtx = getWriterQueueContext();
  if (!queueCtx) {
    return { available: false, incoming: 0, processing: 0, ack: 0 };
  }
  const countFiles = (dirPath) => {
    try {
      if (!fs.existsSync(dirPath)) return 0;
      return fs.readdirSync(dirPath).filter((name) => name.toLowerCase().endsWith(".json")).length;
    } catch {
      return 0;
    }
  };
  return {
    available: true,
    incoming: countFiles(queueCtx.incomingDir),
    processing: countFiles(queueCtx.processingDir),
    ack: countFiles(queueCtx.ackDir)
  };
}

function cleanupQueueArtifacts(queueCtx) {
  const now = Date.now();
  try {
    if (fs.existsSync(queueCtx.ackDir)) {
      const ackFiles = fs.readdirSync(queueCtx.ackDir).filter((name) => name.toLowerCase().endsWith(".json"));
      for (const fileName of ackFiles) {
        const filePath = path.join(queueCtx.ackDir, fileName);
        const stat = fs.statSync(filePath);
        const ageMs = now - stat.mtimeMs;
        if (ageMs < QUEUE_ACK_RETENTION_MS) continue;

        let canDelete = true;
        const ack = readJsonIfExists(filePath);
        const entryId = ack?.result?.id || null;
        if (ack?.ok === true && entryId && userStore && typeof userStore.hasMainCouranteEntry === "function") {
          canDelete = userStore.hasMainCouranteEntry(entryId);
        }
        if (canDelete) {
          fs.unlinkSync(filePath);
        }
      }
    }
  } catch {
    // Best effort cleanup only.
  }

  try {
    if (fs.existsSync(queueCtx.queueRoot)) {
      const tmpFiles = fs
        .readdirSync(queueCtx.queueRoot)
        .filter((name) => /^heartbeat-(master|backup)\.json\.tmp-\d+-\d+$/i.test(name));
      for (const fileName of tmpFiles) {
        const filePath = path.join(queueCtx.queueRoot, fileName);
        const stat = fs.statSync(filePath);
        const ageMs = now - stat.mtimeMs;
        if (ageMs < QUEUE_TMP_RETENTION_MS) continue;
        fs.unlinkSync(filePath);
      }
    }
  } catch {
    // Best effort cleanup only.
  }
}

function ensureWriterQueueDirs() {
  const queueCtx = getWriterQueueContext();
  if (!queueCtx) return null;
  fs.mkdirSync(queueCtx.incomingDir, { recursive: true });
  fs.mkdirSync(queueCtx.processingDir, { recursive: true });
  fs.mkdirSync(queueCtx.ackDir, { recursive: true });
  return queueCtx;
}

function isHeartbeatFresh(filePath, timeoutMs) {
  const data = readJsonIfExists(filePath);
  if (!data?.updatedAt) return false;
  const updatedTs = Date.parse(data.updatedAt);
  if (!Number.isFinite(updatedTs)) return false;
  return Date.now() - updatedTs <= timeoutMs;
}

function isBackupByConfig(writerCfg) {
  const backup = writerCfg?.writer?.backup || {};
  return isLocalNodeMatch(backup);
}

function isMasterByConfig(writerCfg) {
  const master = writerCfg?.writer?.master || {};
  return isLocalNodeMatch(master);
}

function isLocalNodeMatch(nodeCfg) {
  const localHost = normalizeText(os.hostname());
  const localWhoami = normalizeText(`${os.hostname()}\\${os.userInfo().username}`);
  const localIp = normalizeText(getLocalIPv4() || "");
  const matchHost = normalizeText(nodeCfg?.hostname) === localHost;
  const matchWhoami = normalizeText(nodeCfg?.whoami) === localWhoami;
  const matchIp = normalizeText(nodeCfg?.host) === localIp;
  return matchHost || matchWhoami || matchIp;
}

/**
 * Calcule la signature HMAC-SHA256 d'un corps HTTP pour l'authentification inter-nœuds writer.
 * Retourne null si aucun secret n'est configuré.
 */
function computeWriterHmac(secret, signedPayload) {
  if (!secret) return null;
  return "sha256=" + crypto.createHmac("sha256", secret).update(String(signedPayload || "")).digest("hex");
}

/**
 * Vérifie la signature HMAC-SHA256 d'une requête writer entrante.
 * Utilise une comparaison en temps constant pour éviter les attaques par timing.
 * Retourne false si le secret ou la signature est absent ou invalide.
 */
function verifyWriterHmac(secret, signedPayload, sigHeader) {
  if (!secret || !sigHeader) return false;
  const expected = computeWriterHmac(secret, signedPayload);
  try {
    return crypto.timingSafeEqual(Buffer.from(sigHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

function postJson(host, port, requestPath, payload, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (!writerRuntime.secret) {
      reject(new Error("Sécurité writer: secret manquant, émission HTTP refusée."));
      return;
    }
    const body = JSON.stringify(payload);
    const ts = String(Date.now());
    const nonce = crypto.randomBytes(16).toString("hex");
    const signedPayload = `${ts}.${nonce}.${body}`;
    const headers = {
      "content-type": "application/json",
      [WRITER_TS_HEADER]: ts,
      [WRITER_NONCE_HEADER]: nonce
    };
    const sig = computeWriterHmac(writerRuntime.secret, signedPayload);
    if (sig) {
      headers[WRITER_SIG_HEADER] = sig;
    }
    const req = http.request(
      {
        host,
        port,
        path: requestPath,
        method: "POST",
        headers,
        timeout: timeoutMs
      },
      (res) => {
        let rawBody = "";
        res.on("data", (chunk) => {
          rawBody += chunk.toString("utf-8");
        });
        res.on("end", () => {
          try {
            const parsed = rawBody ? JSON.parse(rawBody) : {};
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
              return;
            }
            reject(new Error(parsed?.error || `Writer HTTP ${res.statusCode}`));
          } catch {
            reject(new Error(`Réponse writer invalide (${res.statusCode}).`));
          }
        });
      }
    );
    req.on("error", (error) => reject(error));
    req.on("timeout", () => {
      req.destroy(new Error("Timeout writer"));
    });
    req.write(body);
    req.end();
  });
}

function getJson(host, port, requestPath, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host,
        port,
        path: requestPath,
        method: "GET",
        timeout: timeoutMs
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk.toString("utf-8");
        });
        res.on("end", () => {
          try {
            const parsed = body ? JSON.parse(body) : {};
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
              return;
            }
            reject(new Error(parsed?.error || `Writer HTTP ${res.statusCode}`));
          } catch {
            reject(new Error(`Réponse writer invalide (${res.statusCode}).`));
          }
        });
      }
    );
    req.on("error", (error) => reject(error));
    req.on("timeout", () => req.destroy(new Error("Timeout writer health")));
    req.end();
  });
}

function omitSessionToken(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const { sessionToken: _st, ...rest } = payload;
  return rest;
}

/**
 * Instancie ou réinstancie `UserStore` ; invalide les sessions si le chemin DB change.
 *
 * @param {string} dbPath
 */
function setUserStoreByPath(dbPath) {
  const next = path.normalize(String(dbPath || ""));
  const prev = userStore?.dbPath ? path.normalize(userStore.dbPath) : null;
  if (prev && prev !== next) {
    sessionMain.clearAllSessions();
  }
  userStore = new UserStore(dbPath, { isPackaged: app.isPackaged });
}

function getQuarterKey(date = new Date()) {
  return dbPathUtils.getQuarterKey(date);
}

function canManageArchiveSession(requesterUsername) {
  return dbAccessControlService.canManageArchiveSession(requesterUsername);
}

function getActiveUserRole(username) {
  return dbAccessControlService.getActiveUserRole(username);
}

function getDbStorageLayoutFromPath(dbPath) {
  return dbPathUtils.getDbStorageLayoutFromPath(path, dbPath);
}

function normalizeNestedQuarterDbPath(dbPath) {
  return dbPathUtils.normalizeNestedQuarterDbPath(path, fs, dbPath);
}

function buildQuarterDbPath(currentDbPath, quarterKey) {
  return dbPathUtils.buildQuarterDbPath(path, currentDbPath, quarterKey);
}

function buildCanonicalActiveDbPath(currentDbPath) {
  return dbPathUtils.buildCanonicalActiveDbPath(path, currentDbPath);
}

/**
 * Copie la base vers le trimestre courant si besoin (rotation fichier `.db` + audit).
 *
 * @param {string} [trigger]
 */
function ensureQuarterRotationIfNeeded(trigger = "scheduler") {
  const currentDbPath = resolveDbPath();
  if (!currentDbPath || !fs.existsSync(currentDbPath)) {
    return { rotated: false, reason: "db_not_configured" };
  }
  const quarterKey = getQuarterKey(new Date());
  const cfg = readAppConfig();
  const lastArchivedQuarterKey = String(cfg.lastArchivedQuarterKey || "").toUpperCase();
  if (lastArchivedQuarterKey === quarterKey) {
    return { rotated: false, reason: "already_on_current_quarter", quarterKey, dbPath: currentDbPath };
  }
  const targetPath = buildQuarterDbPath(currentDbPath, quarterKey);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (!fs.existsSync(targetPath)) {
    fs.copyFileSync(currentDbPath, targetPath);
  }
  const canonicalActivePath = buildCanonicalActiveDbPath(currentDbPath);
  fs.mkdirSync(path.dirname(canonicalActivePath), { recursive: true });
  if (path.resolve(currentDbPath) !== path.resolve(canonicalActivePath)) {
    fs.copyFileSync(currentDbPath, canonicalActivePath);
  }
  writeAppConfig({ ...cfg, dbPath: canonicalActivePath, lastArchivedQuarterKey: quarterKey });
  setUserStoreByPath(canonicalActivePath);

  archiveRuntime = {
    ...archiveRuntime,
    lastQuarterRotationAt: new Date().toISOString(),
    lastQuarterFrom: currentDbPath,
    lastQuarterTo: canonicalActivePath,
    lastError: null
  };

  userStore.logAudit({
    actorUsername: "system:archive",
    action: "DB_QUARTER_ROTATION",
    details: {
      trigger,
      quarterKey,
      beforeDbPath: currentDbPath,
      afterDbPath: canonicalActivePath,
      archiveDbPath: targetPath
    }
  });
  return { rotated: true, quarterKey, beforeDbPath: currentDbPath, afterDbPath: canonicalActivePath, archiveDbPath: targetPath };
}

/**
 * Archive logique des entrées main courante clôturées (délai `ARCHIVE_LOGICAL_DELAY_DAYS`).
 */
function runLogicalArchiveNow({ trigger = "scheduler", requesterUsername = "system:archive" } = {}) {
  ensureStore();
  const cfg = readAppConfig();
  const lastArchiveBatchAt = cfg.lastArchiveBatchAt ? new Date(cfg.lastArchiveBatchAt) : null;
  const now = new Date();
  if (trigger === "scheduler" && lastArchiveBatchAt && !Number.isNaN(lastArchiveBatchAt.getTime())) {
    const diffMs = now.getTime() - lastArchiveBatchAt.getTime();
    const minIntervalMs = 10 * 24 * 60 * 60 * 1000;
    if (diffMs < minIntervalMs) {
      return {
        skipped: true,
        reason: "archive_interval_not_reached",
        nextArchiveAt: new Date(lastArchiveBatchAt.getTime() + minIntervalMs).toISOString()
      };
    }
  }
  const result = userStore.archiveMainCouranteClosedEntries({
    requesterUsername,
    delayDays: ARCHIVE_LOGICAL_DELAY_DAYS
  });
  writeAppConfig({ ...cfg, lastArchiveBatchAt: now.toISOString() });
  archiveRuntime = {
    ...archiveRuntime,
    lastLogicalRunAt: new Date().toISOString(),
    lastLogicalResult: { ...result, trigger },
    lastArchiveBatchAt: now.toISOString(),
    lastError: null
  };
  return result;
}

function getAutoArchiveEligibility() {
  ensureStore();
  const minAgeDays = Math.max(0, Number(ARCHIVE_AUTO_MIN_DB_AGE_DAYS) || 0);
  let firstActivityAt = null;
  const firstDateCandidates = [];
  const minDateQueries = [
    "SELECT MIN(occurred_at) AS dt FROM audit_logs WHERE occurred_at IS NOT NULL",
    "SELECT MIN(created_at) AS dt FROM data_sites WHERE created_at IS NOT NULL",
    "SELECT MIN(created_at) AS dt FROM data_intervenants WHERE created_at IS NOT NULL",
    "SELECT MIN(created_at) AS dt FROM data_anomaly_types WHERE created_at IS NOT NULL",
    "SELECT MIN(created_at) AS dt FROM data_holidays WHERE created_at IS NOT NULL",
    "SELECT MIN(created_at) AS dt FROM data_ronde_motif_types WHERE created_at IS NOT NULL",
    "SELECT MIN(created_at) AS dt FROM fransor_responsables WHERE created_at IS NOT NULL"
  ];
  for (const sql of minDateQueries) {
    try {
      const row = userStore.db.prepare(sql).get();
      if (row?.dt) firstDateCandidates.push(row.dt);
    } catch {
      // Tolère les écarts de schéma historiques : on continue avec les autres référentiels.
    }
  }
  if (firstDateCandidates.length > 0) {
    firstActivityAt = firstDateCandidates
      .map((value) => ({ value, ts: new Date(value).getTime() }))
      .filter((item) => !Number.isNaN(item.ts))
      .sort((a, b) => a.ts - b.ts)[0]?.value || null;
  }
  if (!firstActivityAt) {
    return {
      eligible: false,
      reason: "db_no_activity",
      minAgeDays,
      dbAgeDays: 0,
      firstActivityAt: null
    };
  }
  const firstTs = new Date(firstActivityAt).getTime();
  if (Number.isNaN(firstTs)) {
    return {
      eligible: false,
      reason: "db_activity_date_invalid",
      minAgeDays,
      dbAgeDays: 0,
      firstActivityAt
    };
  }
  const dbAgeDays = Math.floor((Date.now() - firstTs) / (24 * 60 * 60 * 1000));
  return {
    eligible: dbAgeDays >= minAgeDays,
    reason: dbAgeDays >= minAgeDays ? "ok" : "db_age_below_threshold",
    minAgeDays,
    dbAgeDays,
    firstActivityAt
  };
}

function canRunArchiveManually(requesterUsername) {
  return dbAccessControlService.canRunArchiveManually(requesterUsername);
}

/** Vérifie que l'utilisateur peut modifier la configuration de la base de données. */
function canManageDatabase(requesterUsername) {
  return dbAccessControlService.canManageDatabase(requesterUsername);
}

/**
 * Résout le chemin de la base active (`app-config` puis candidats portables / dev).
 *
 * @returns {string|null}
 */
function resolveDbPath() {
  const appCfg = readAppConfig();
  const explicitPath = appCfg.dbPath;
  if (explicitPath && fs.existsSync(explicitPath)) {
    return normalizeNestedQuarterDbPath(explicitPath);
  }
  const exeDir = path.dirname(app.getPath("exe"));
  const exeParentDir = path.dirname(exeDir);
  const exeGrandParentDir = path.dirname(exeParentDir);
  const portableExeDir = process.env.PORTABLE_EXECUTABLE_DIR || null;
  const portableExeParentDir = portableExeDir ? path.dirname(portableExeDir) : null;
  const portableExeGrandParentDir = portableExeParentDir ? path.dirname(portableExeParentDir) : null;
  const candidates = [
    path.join(process.cwd(), "data", "Activedb", "gts-active.db"),
    path.join(process.cwd(), "Z_Dossier_Perso", "gts.db"),
    path.join(process.cwd(), "data", "gts.db"),
    path.join(exeDir, "data", "gts.db"),
    path.join(exeParentDir, "data", "gts.db"),
    path.join(exeGrandParentDir, "data", "gts.db"),
    path.join(exeDir, "data", "Activedb", "gts-active.db"),
    path.join(exeParentDir, "data", "Activedb", "gts-active.db"),
    path.join(exeGrandParentDir, "data", "Activedb", "gts-active.db"),
    portableExeDir ? path.join(portableExeDir, "data", "gts.db") : null,
    portableExeParentDir ? path.join(portableExeParentDir, "data", "gts.db") : null,
    portableExeGrandParentDir ? path.join(portableExeGrandParentDir, "data", "gts.db") : null,
    portableExeDir ? path.join(portableExeDir, "data", "Activedb", "gts-active.db") : null,
    portableExeParentDir ? path.join(portableExeParentDir, "data", "Activedb", "gts-active.db") : null,
    portableExeGrandParentDir ? path.join(portableExeGrandParentDir, "data", "Activedb", "gts-active.db") : null
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function getDataRootCandidates() {
  const appCfg = readAppConfig();
  const exeDir = path.dirname(app.getPath("exe"));
  const exeParentDir = path.dirname(exeDir);
  const exeGrandParentDir = path.dirname(exeParentDir);
  const portableExeDir = process.env.PORTABLE_EXECUTABLE_DIR || null;
  const portableExeParentDir = portableExeDir ? path.dirname(portableExeDir) : null;
  const portableExeGrandParentDir = portableExeParentDir ? path.dirname(portableExeParentDir) : null;
  const dbDataRoot = appCfg.dbPath && fs.existsSync(appCfg.dbPath) ? getDbStorageLayoutFromPath(appCfg.dbPath).dataRoot : null;
  const candidates = [
    dbDataRoot,
    path.join(process.cwd(), "data"),
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
  resolveDbPath,
  getDbStorageLayoutFromPath,
  ensureStore,
  getUserStore: () => userStore
});

const databaseAdmin = createDatabaseAdminService({
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
  getArchiveRuntime: () => archiveRuntime,
  setArchiveRuntime: (next) => {
    archiveRuntime = next;
  },
  getUserStore: () => userStore
});

function getDbConfig() {
  return databaseAdmin.getDbConfig();
}

function listAvailableDatabases() {
  return databaseAdmin.listAvailableDatabases();
}

function switchActiveDatabase(nextDbPath, { requesterRole = null, requesterUsername = "system:db-switch" } = {}) {
  return databaseAdmin.switchActiveDatabase(nextDbPath, { requesterRole, requesterUsername });
}

function ensureStore() {
  if (!userStore) {
    throw new Error("La base de donnees n est pas configuree.");
  }
}

const writerHttpServerService = createWriterHttpServerService({
  http,
  writerMaxBodyBytes: WRITER_MAX_BODY_BYTES,
  writerSigHeader: WRITER_SIG_HEADER,
  writerTsHeader: WRITER_TS_HEADER,
  writerNonceHeader: WRITER_NONCE_HEADER,
  writerReplayWindowMs: WRITER_REPLAY_WINDOW_MS,
  getWriterRuntime: () => writerRuntime,
  setWriterRuntime: (next) => {
    writerRuntime = next;
  },
  getLocalSourceContext,
  appendWriterTransitLog,
  verifyWriterHmac,
  ensureStore,
  getUserStore: () => userStore
});
function stopWriterServer() {
  return writerHttpServerService.stopWriterServer();
}

const writerMonitorService = createWriterMonitorService({
  appendWriterTransitLog,
  getLocalSourceContext,
  getJson,
  getWriterRuntime: () => writerRuntime,
  setWriterRuntime: (next) => {
    writerRuntime = next;
  }
});
function stopWriterMonitor() {
  return writerMonitorService.stopWriterMonitor();
}

function updateSmbConnectivity(queueCtx) {
  if (!queueCtx) return;
  const freshnessWindowMs = Math.max((writerRuntime.heartbeatIntervalMs || 3000) * 3, 6000);
  const masterFresh = isHeartbeatFresh(queueCtx.heartbeatMasterFile, freshnessWindowMs);
  const backupFresh = isHeartbeatFresh(queueCtx.heartbeatBackupFile, freshnessWindowMs);
  if (writerRuntime.role === "master") {
    updateConnectivityAndLog("backupReachable", backupFresh, { mode: "smb_queue" });
    return;
  }
  if (writerRuntime.role === "backup") {
    updateConnectivityAndLog("masterReachable", masterFresh, { mode: "smb_queue" });
    return;
  }
  if (writerRuntime.role === "client") {
    updateConnectivityAndLog("masterReachable", masterFresh, { mode: "smb_queue" });
    updateConnectivityAndLog("backupReachable", backupFresh, { mode: "smb_queue" });
  }
}

let writerQueueWorkerService = null;
function getWriterQueueWorkerService() {
  if (!writerQueueWorkerService) {
    writerQueueWorkerService = createWriterQueueWorkerService({
      fs,
      path,
      readJsonIfExists,
      ensureStore,
      safeWriteJson,
      getLocalSourceContext,
      appendWriterTransitLog,
      executeQueuedAction: (action, payload, deps) =>
        executeQueuedAction(action, payload, {
          userStore,
          ...deps
        }),
      ensureQuarterRotationIfNeeded,
      runLogicalArchiveNow,
      getArchiveRuntime: () => archiveRuntime,
      setArchiveRuntime: (next) => {
        archiveRuntime = next;
      },
      ensureWriterQueueDirs,
      cleanupQueueArtifacts,
      updateSmbConnectivity,
      isHeartbeatFresh,
      getWriterRuntime: () => writerRuntime
    });
  }
  return writerQueueWorkerService;
}
function stopWriterQueueWorker() {
  return getWriterQueueWorkerService().stopWriterQueueWorker();
}
function startWriterQueueWorker() {
  return getWriterQueueWorkerService().startWriterQueueWorker();
}

const writerQueueEnqueueService = createWriterQueueEnqueueService({
  fs,
  path,
  ensureWriterQueueDirs,
  getLocalSourceContext,
  safeWriteJson,
  readJsonIfExists,
  appendWriterTransitLog,
  startDeferredAckCleanup,
  sleep,
  omitSessionToken
});

const archiveRunnerService = createArchiveRunnerService({
  path,
  ensureWriterQueueDirs,
  safeWriteJson,
  getLocalSourceContext,
  ensureQuarterRotationIfNeeded,
  runLogicalArchiveNow,
  getAutoArchiveEligibility,
  getUserStore: () => userStore,
  writerRuntimeRef: () => writerRuntime,
  archiveLogicalDelayDays: ARCHIVE_LOGICAL_DELAY_DAYS,
  archiveSchedulerIntervalMs: ARCHIVE_SCHEDULER_INTERVAL_MS,
  getArchiveRuntime: () => archiveRuntime,
  setArchiveRuntime: (next) => {
    archiveRuntime = next;
  }
});

async function enqueueCreateAndWaitAck(payload) {
  return writerQueueEnqueueService.enqueueCreateAndWaitAck(payload);
}

async function enqueueUpdateOperatorAndWaitAck(payload) {
  return writerQueueEnqueueService.enqueueUpdateOperatorAndWaitAck(payload);
}

async function enqueueManagerActionAndWaitAck(payload) {
  return writerQueueEnqueueService.enqueueManagerActionAndWaitAck(payload);
}

async function enqueueManagerReopenAndWaitAck(payload) {
  return writerQueueEnqueueService.enqueueManagerReopenAndWaitAck(payload);
}

async function enqueueInterventionActionAndWaitAck(action, payload) {
  return writerQueueEnqueueService.enqueueInterventionActionAndWaitAck(action, payload);
}

function enqueueArchiveRun({ trigger = "scheduler", requesterUsername = "system:archive" } = {}) {
  return archiveRunnerService.enqueueArchiveRun({ trigger, requesterUsername });
}

async function runArchiveCycle({ trigger = "scheduler", requesterUsername = "system:archive" } = {}) {
  return archiveRunnerService.runArchiveCycle({ trigger, requesterUsername });
}

function stopArchiveScheduler() {
  return archiveRunnerService.stopArchiveScheduler();
}

function startArchiveScheduler() {
  return archiveRunnerService.startArchiveScheduler();
}

let gardiennageAutoCloseTimer = null;

function runBackgroundAutoCloseTick() {
  try {
    ensureStore();
    userStore.extendOpenEndedGardiennageHorizons();
    userStore.autoCloseExpiredGardiennages();
    userStore.autoCloseExpiredExceptionalRondes();
  } catch {
    // Tick silencieux si la base n'est pas encore prête.
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

function updateConnectivityAndLog(key, reachable, details) {
  return writerMonitorService.updateConnectivityAndLog(key, reachable, details);
}

function startWriterMonitor() {
  return writerMonitorService.startWriterMonitor();
}

function startWriterServer() {
  return writerHttpServerService.startWriterServer();
}

const writerRuntimeService = createWriterRuntimeService({
  isDev,
  readAppConfig,
  writeAppConfig,
  resolveWriterConfigPath,
  stopWriterServer,
  stopWriterMonitor,
  stopWriterQueueWorker,
  startWriterServer,
  startWriterMonitor,
  startWriterQueueWorker,
  setupTrayIfNeeded,
  refreshTrayMenu,
  appendWriterTransitLog,
  getLocalSourceContext,
  isLocalNodeMatch,
  isMasterByConfig,
  isBackupByConfig,
  getWriterRuntime: () => writerRuntime,
  setWriterRuntime: (next) => {
    writerRuntime = next;
  },
  path,
  processCwd: process.cwd(),
  app,
  portableExecutableDir: process.env.PORTABLE_EXECUTABLE_DIR || null
});
/** Relit la config writer, résout le rôle local et démarre/arrête HTTP, monitor, worker SMB, tray. */
function refreshWriterRuntime() {
  return writerRuntimeService.refreshWriterRuntime();
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
    normalized.includes("database is locked") ||
    normalized.includes("sqlite_busy") ||
    normalized.includes("sqlite_locked")
  ) {
    return "La base de données est temporairement verrouillée. Réessayez dans quelques secondes.";
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
  listAvailableDatabases,
  switchActiveDatabase,
  archiveRuntime,
  ARCHIVE_LOGICAL_DELAY_DAYS,
  ARCHIVE_SCHEDULER_INTERVAL_MS,
  getQuarterKey,
  resolveDbPath,
  canRunArchiveManually,
  runArchiveCycle,
  getWriterRuntime: () => writerRuntime,
  getWriterQueueStats,
  getLocalNodeIdentity,
  ensureStore,
  getUserStore: () => userStore,
  generateWriterConfigFile,
  documentTemplates,
  getWriterLogContext,
  fallbackWriterLogsDir,
  fs,
  shell,
  app,
  setIsAppQuitting: (value) => {
    isAppQuitting = value;
  },
  getMainWindow: () => mainWindow,
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
  setDevToolsAccessEnabled: (enabled) => {
    devToolsAccessEnabled = Boolean(enabled);
  }
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
  getWriterRuntime: () => writerRuntime,
  enqueueUpdateOperatorAndWaitAck,
  enqueueManagerActionAndWaitAck,
  enqueueManagerReopenAndWaitAck,
  enqueueInterventionActionAndWaitAck,
  getActiveUsernames: sessionMain.getActiveUsernames
});
/**
 * Création main courante : écriture locale (master/backup), file SMB ou forward HTTP Maître puis Backup.
 */
handleIpcAuth("mainCourante:create", (payload) => {
  ensureStore();
  if (!writerRuntime.enabled || writerRuntime.role === "master" || writerRuntime.role === "backup") {
    appendWriterTransitLog({
      event: "mainCourante_create_local",
      requestId: payload?.requestId || null,
      actor: payload?.requesterUsername || "unknown",
      source: getLocalSourceContext()
    });
    return userStore.createMainCouranteEntry(payload);
  }
  if (writerRuntime.transportMode === "smb_queue") {
    return enqueueCreateAndWaitAck(payload);
  }
  const requestId = payload?.requestId || `req-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  appendWriterTransitLog({
    event: "mainCourante_create_forward",
    requestId,
    to: `${writerRuntime.masterHost}:${writerRuntime.masterPort}`,
    actor: payload?.requesterUsername || "unknown",
    source: getLocalSourceContext()
  });
  const requestPayload = {
    requestId,
    source: getLocalSourceContext(),
    payload: { ...omitSessionToken(payload), requestId }
  };
  return postJson(writerRuntime.masterHost, writerRuntime.masterPort, "/writer/mainCourante/create", requestPayload)
    .catch(async (error) => {
      appendWriterTransitLog({
        event: "mainCourante_create_forward_master_failed",
        requestId,
        source: getLocalSourceContext(),
        error: error?.message || "master_unreachable"
      });
      if (!writerRuntime.failoverEnabled || !writerRuntime.backupHost || !writerRuntime.backupPort) {
        throw error;
      }
      appendWriterTransitLog({
        event: "mainCourante_create_forward_backup_attempt",
        requestId,
        to: `${writerRuntime.backupHost}:${writerRuntime.backupPort}`,
        source: getLocalSourceContext()
      });
      return postJson(writerRuntime.backupHost, writerRuntime.backupPort, "/writer/mainCourante/create", requestPayload);
    })
    .then((response) => {
      appendWriterTransitLog({
        event: "mainCourante_create_forward_ack",
        requestId,
        result: "SUCCESS",
        source: getLocalSourceContext()
      });
      return response.result;
  });
});

/** Démarrage : sessions persistées, base, writer, planificateurs, fenêtre principale. */
app.whenReady().then(() => {
  // Supprime la barre de menu globalement (toutes les fenêtres de l'application).
  Menu.setApplicationMenu(null);
  sessionMain.loadPersistedSessions();
  const cfg = readAppConfig();
  const resolvedDbPath = resolveDbPath();
  if (resolvedDbPath) {
    setUserStoreByPath(resolvedDbPath);
    if (cfg.dbPath !== resolvedDbPath) {
      writeAppConfig({ ...cfg, dbPath: resolvedDbPath });
    }
  }
  refreshWriterRuntime();
  startArchiveScheduler();
  startGardiennageAutoCloseScheduler();
  createWindow();
});

app.on("window-all-closed", () => {
  stopWriterServer();
  stopWriterMonitor();
  stopWriterQueueWorker();
  stopArchiveScheduler();
  stopGardiennageAutoCloseScheduler();
  // Windows/Linux : dernière fenêtre fermée = quitter (la réduction tray utilise hide(), pas destroy).
  if (process.platform !== "darwin") app.quit();
});
