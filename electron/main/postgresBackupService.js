/**
 * Sauvegardes PostgreSQL : dump complet (`pg_dump -Fc`), planning quotidien 03:00,
 * rétention (14 journalières + 12 mensuelles), restauration.
 *
 * Dump auto uniquement si l'hôte PG du poste est une adresse de boucle locale
 * (PC qui héberge Docker / PostgreSQL).
 *
 * @module electron/main/postgresBackupService
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { Client } = require("pg");
const { getPostgresConnectionConfig } = require("../store/persistence/postgresConnectionConfig");
const { probePostgresLab } = require("../store/persistence/postgresLabProbe");
const {
  DAILY_HOUR,
  DAILY_KEEP,
  MONTHLY_KEEP,
  readPostgresBackupConfig,
  writePostgresBackupConfig
} = require("../store/persistence/postgresBackupConfig");
const { appendPostgresEvent } = require("../store/persistence/postgresEventLog");
const { captureRestoreSnapshot, writeRestoreDiffReports } = require("./postgresRestoreDiff");
const { runDumpCompare } = require("./postgresDumpCompare");

const DEFAULT_CONTAINER = "goron-pg18";
const DUMP_EXT = ".dump";
/** En-tête binaire d'un dump PostgreSQL `-Fc`. */
const DUMP_MAGIC = "PGDMP";
const SCHEDULER_INTERVAL_MS = 60 * 1000;
const SCHEDULER_ACTOR = "system:pg-backup";
const BUSY_ERROR = "Une sauvegarde, une restauration ou une comparaison est déjà en cours.";
/** Jeton de fichier (FR) par type interne. */
const DUMP_KIND_TOKENS = {
  daily: "journaliere",
  monthly: "mensuelle",
  manual: "manuelle"
};
/** Anciens jetons EN + jetons FR → type interne. */
const DUMP_KIND_FROM_TOKEN = {
  daily: "daily",
  journaliere: "daily",
  journalière: "daily",
  monthly: "monthly",
  mensuelle: "monthly",
  manual: "manual",
  manuelle: "manual"
};
const FILE_RE =
  /^goron_gts_(daily|monthly|manual|journaliere|journalière|mensuelle|manuelle)_(\d{4}-\d{2}(?:-\d{2})?)(?:_(\d{2}-\d{2}))?\.dump$/i;

/**
 * @param {string} host
 * @returns {boolean}
 */
function isLoopbackHost(host) {
  const h = String(host || "").trim().toLowerCase();
  if (!h) return false;
  if (h === "localhost" || h === "::1") return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h);
}

/**
 * @param {string} username
 * @returns {string}
 */
function reportActorLabel(username) {
  const raw = String(username || "").trim();
  if (!raw || raw === "system" || raw.toLowerCase().startsWith("system:")) {
    return "Système";
  }
  return raw;
}

/**
 * Événement de sauvegarde dans le journal technique local (`gts-pg-events.log`).
 * Les dumps / comparaisons / restaurations n'alimentent plus l'audit métier.
 *
 * @param {string} code
 * @param {string} messageFr
 * @param {object} [details]
 * @returns {void}
 */
function logBackupTechEvent(code, messageFr, details) {
  appendPostgresEvent({
    source: "system:pg-backup",
    code,
    messageFr,
    details: details && typeof details === "object" ? details : null
  });
}

/**
 * @returns {string}
 */
function dockerContainerName() {
  return String(process.env.GTS_PG_DOCKER_CONTAINER || DEFAULT_CONTAINER).trim() || DEFAULT_CONTAINER;
}

/**
 * @param {Date} [date]
 * @returns {string}
 */
function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * @param {Date} [date]
 * @returns {string}
 */
function localMonthKey(date = new Date()) {
  return localDateKey(date).slice(0, 7);
}

/**
 * @param {Date} [date]
 * @returns {string}
 */
function localTimeKey(date = new Date()) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}-${mm}`;
}

/**
 * @param {string} fileName
 * @returns {"daily"|"monthly"|"manual"|"custom"}
 */
function dumpKindFromFileName(fileName) {
  const match = FILE_RE.exec(path.basename(String(fileName || "")));
  if (!match) return "custom";
  return DUMP_KIND_FROM_TOKEN[match[1].toLowerCase()] || "custom";
}

/**
 * Nom de dump en français (sans accent, pour USB / NAS).
 *
 * @param {"daily"|"monthly"|"manual"} kind
 * @param {Date} [date]
 * @returns {string}
 */
function dumpFileNameForKind(kind, date = new Date()) {
  const token = DUMP_KIND_TOKENS[kind] || DUMP_KIND_TOKENS.manual;
  if (kind === "daily") return `goron_gts_${token}_${localDateKey(date)}${DUMP_EXT}`;
  if (kind === "monthly") return `goron_gts_${token}_${localMonthKey(date)}${DUMP_EXT}`;
  return `goron_gts_${token}_${localDateKey(date)}_${localTimeKey(date)}${DUMP_EXT}`;
}

/**
 * @param {string} fileName
 * @returns {string|null} nouveau nom, ou null si déjà FR / hors schéma
 */
function frenchDumpFileNameFromLegacy(fileName) {
  const name = path.basename(String(fileName || ""));
  const match = FILE_RE.exec(name);
  if (!match) return null;
  const token = match[1].toLowerCase();
  if (token === "daily") return name.replace(/^goron_gts_daily_/i, `goron_gts_${DUMP_KIND_TOKENS.daily}_`);
  if (token === "monthly") return name.replace(/^goron_gts_monthly_/i, `goron_gts_${DUMP_KIND_TOKENS.monthly}_`);
  if (token === "manual") return name.replace(/^goron_gts_manual_/i, `goron_gts_${DUMP_KIND_TOKENS.manual}_`);
  return null;
}

/**
 * Renomme les dumps encore préfixés EN, sans écraser un fichier FR déjà présent.
 *
 * @param {string} folder
 * @returns {void}
 */
function migrateLegacyDumpNames(folder) {
  let names = [];
  try {
    names = fs.readdirSync(folder);
  } catch {
    return;
  }
  for (const name of names) {
    const frenchName = frenchDumpFileNameFromLegacy(name);
    if (!frenchName || frenchName === name) continue;
    const dest = path.join(folder, frenchName);
    if (fs.existsSync(dest)) continue;
    try {
      fs.renameSync(path.join(folder, name), dest);
    } catch {
      // ignore
    }
  }
}

/**
 * @param {string} folderPath
 * @param {string} fileName
 * @returns {string}
 */
function resolveDumpPath(folderPath, fileName) {
  const folder = path.resolve(String(folderPath || "").trim());
  const name = path.basename(String(fileName || "").trim());
  if (!folder || !name) {
    throw new Error("Dossier ou nom de fichier de sauvegarde invalide.");
  }
  if (!name.toLowerCase().endsWith(DUMP_EXT)) {
    throw new Error("Le fichier de sauvegarde doit être au format .dump.");
  }
  return path.join(folder, name);
}

/**
 * Vérifie qu'un fichier est un dump PostgreSQL custom (`PGDMP`), pas un SQL texte.
 *
 * @param {string} filePath
 * @returns {boolean}
 */
function isPgDumpCustomFormat(filePath) {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(5);
    const read = fs.readSync(fd, buf, 0, 5, 0);
    fs.closeSync(fd);
    return read >= 5 && buf.toString("utf8") === DUMP_MAGIC;
  } catch {
    return false;
  }
}

/**
 * @param {string} filePath
 * @returns {void}
 */
function unlinkIfExists(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

/**
 * Lance un binaire (`docker`, `pg_dump`, `pg_restore`) en masquant la fenêtre Windows.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {{ env?: NodeJS.ProcessEnv, stdoutPath?: string, stdinPath?: string }} [options]
 * @returns {Promise<{ stderr: string }>}
 */
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      env: { ...process.env, ...(options.env || {}) }
    });
    const stderrChunks = [];
    if (options.stdoutPath) {
      const out = fs.createWriteStream(options.stdoutPath);
      child.stdout.pipe(out);
      out.on("error", (err) => {
        child.kill();
        reject(err);
      });
    } else {
      child.stdout.resume();
    }
    if (options.stdinPath) {
      const input = fs.createReadStream(options.stdinPath);
      input.pipe(child.stdin);
      input.on("error", (err) => {
        child.kill();
        reject(err);
      });
    }
    child.stderr.on("data", (chunk) => {
      stderrChunks.push(chunk);
    });
    child.on("error", (err) => {
      if (err && err.code === "ENOENT") {
        reject(new Error(`${command} introuvable sur ce poste.`));
        return;
      }
      reject(err);
    });
    child.on("close", (code) => {
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      if (code !== 0) {
        reject(new Error(stderr || `${command} a échoué (code ${code}).`));
        return;
      }
      resolve({ stderr });
    });
  });
}

/**
 * @param {string} name
 * @returns {Promise<boolean>}
 */
async function isDockerContainerRunning(name) {
  try {
    const { spawnSync } = require("child_process");
    const result = spawnSync("docker", ["inspect", "-f", "{{.State.Running}}", name], {
      windowsHide: true,
      encoding: "utf8"
    });
    return result.status === 0 && String(result.stdout || "").trim().toLowerCase() === "true";
  } catch {
    return false;
  }
}

/**
 * Dump `-Fc` : `docker exec pg_dump` si PostgreSQL est en local, sinon `pg_dump` distant.
 *
 * @param {object} cfg
 * @param {string} destPath
 * @returns {Promise<void>}
 */
async function dumpDatabase(cfg, destPath) {
  const container = dockerContainerName();
  const tmpPath = `${destPath}.partial`;
  unlinkIfExists(tmpPath);

  const pgDumpArgs = ["-U", cfg.user, "-d", cfg.database, "-F", "c", "--no-owner", "--no-acl"];
  try {
    if (isLoopbackHost(cfg.host) && (await isDockerContainerRunning(container))) {
      await runCommand("docker", ["exec", "-i", container, "pg_dump", ...pgDumpArgs], { stdoutPath: tmpPath });
    } else {
      await runCommand(
        "pg_dump",
        ["-h", cfg.host, "-p", String(cfg.port), ...pgDumpArgs, "-f", tmpPath],
        { env: { PGPASSWORD: String(cfg.password || "") } }
      );
    }
  } catch (error) {
    unlinkIfExists(tmpPath);
    const message = error instanceof Error ? error.message : String(error || "");
    if (/introuvable/i.test(message) || /enoent/i.test(message)) {
      throw new Error(
        isLoopbackHost(cfg.host)
          ? `Outil de sauvegarde introuvable. Démarrez le conteneur ${container} (Docker Desktop).`
          : "pg_dump introuvable sur ce poste. Lancez les dumps sur le PC qui héberge PostgreSQL."
      );
    }
    throw new Error(message || "La sauvegarde PostgreSQL a échoué.");
  }

  if (!isPgDumpCustomFormat(tmpPath)) {
    unlinkIfExists(tmpPath);
    throw new Error("Le fichier généré n'est pas une sauvegarde PostgreSQL valide.");
  }
  fs.renameSync(tmpPath, destPath);
}

/**
 * Coupe les autres sessions sur la base avant un `pg_restore --clean`.
 *
 * @param {object} cfg
 * @returns {Promise<void>}
 */
async function terminateOtherBackends(cfg) {
  const client = new Client({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    connectionTimeoutMillis: cfg.connectionTimeoutMillis || 2500
  });
  await client.connect();
  try {
    await client.query(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [cfg.database]
    );
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Restaure un dump `-Fc`. `options.database` cible une autre base (comparaison temporaire).
 *
 * @param {object} cfg
 * @param {string} srcPath
 * @param {{ database?: string, clean?: boolean }} [options]
 * @returns {Promise<void>}
 */
async function restoreDatabase(cfg, srcPath, options = {}) {
  const database = String(options.database || cfg.database).trim() || cfg.database;
  const clean = options.clean !== false;
  const container = dockerContainerName();
  const pgRestoreArgs = [
    "-U",
    cfg.user,
    "-d",
    database,
    ...(clean ? ["--clean", "--if-exists"] : []),
    "--no-owner",
    "--no-acl"
  ];
  try {
    if (isLoopbackHost(cfg.host) && (await isDockerContainerRunning(container))) {
      await runCommand("docker", ["exec", "-i", container, "pg_restore", ...pgRestoreArgs], { stdinPath: srcPath });
    } else {
      await runCommand("pg_restore", ["-h", cfg.host, "-p", String(cfg.port), ...pgRestoreArgs, srcPath], {
        env: { PGPASSWORD: String(cfg.password || "") }
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    if (/introuvable/i.test(message) || /enoent/i.test(message)) {
      throw new Error(
        isLoopbackHost(cfg.host)
          ? `Outil de restauration introuvable. Démarrez le conteneur ${container} (Docker Desktop).`
          : "pg_restore introuvable sur ce poste. Restaurez depuis le PC qui héberge PostgreSQL."
      );
    }
    throw new Error(message || "La restauration PostgreSQL a échoué.");
  }
}

/**
 * Liste les `.dump` du dossier (renomme au passage les anciens préfixes EN).
 *
 * @param {string} folderPath
 * @returns {Array<{ fileName: string, filePath: string, kind: string, createdAt: string, sizeBytes: number }>}
 */
function listDumpFiles(folderPath) {
  const folder = String(folderPath || "").trim();
  if (!folder || !fs.existsSync(folder)) return [];
  migrateLegacyDumpNames(folder);
  let names = [];
  try {
    names = fs.readdirSync(folder);
  } catch {
    return [];
  }
  const rows = [];
  for (const name of names) {
    if (!name.toLowerCase().endsWith(DUMP_EXT)) continue;
    const filePath = path.join(folder, name);
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    const kind = dumpKindFromFileName(name);
    rows.push({
      fileName: name,
      filePath,
      kind,
      createdAt: stat.mtime.toISOString(),
      sizeBytes: stat.size
    });
  }
  rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return rows;
}

/**
 * Conserve au plus 14 journalières et 12 mensuelles. Les copies manuelles ne sont pas effacées.
 *
 * @param {string} folderPath
 * @returns {void}
 */
function applyRetention(folderPath) {
  const files = listDumpFiles(folderPath);
  const prune = (kind, keep) => {
    const subset = files.filter((row) => row.kind === kind);
    for (const row of subset.slice(keep)) {
      try {
        fs.unlinkSync(row.filePath);
      } catch {
        // ignore
      }
    }
  };
  prune("daily", DAILY_KEEP);
  prune("monthly", MONTHLY_KEEP);
}

/**
 * Fabrique le service de sauvegarde PostgreSQL.
 *
 * @param {object} deps
 * @param {import('electron').Dialog} deps.dialog
 * @param {import('electron').Shell} deps.shell
 * @param {() => import('electron').BrowserWindow|null} deps.getMainWindow
 * @param {() => import('../userStore')|null} deps.getUserStore
 * @param {(username: string) => boolean} deps.canManageDatabase
 * @param {{ reconnect: () => Promise<object> }} deps.postgresAdmin
 * @param {import('electron').App} [deps.app]
 * @returns {object}
 */
function createPostgresBackupService(deps) {
  const { dialog, shell, getMainWindow, getUserStore, canManageDatabase, postgresAdmin, app } = deps;
  let busy = false;
  let schedulerTimer = null;

  /**
   * @param {string} requesterUsername
   * @returns {void}
   */
  function assertCanManage(requesterUsername) {
    if (!canManageDatabase(requesterUsername)) {
      const err = new Error("Droits insuffisants pour gérer les sauvegardes PostgreSQL.");
      err.code = "FORBIDDEN";
      throw err;
    }
  }

  /**
   * Écriture audit métier (choix du dossier / planning). Les dumps vont au journal technique.
   *
   * @param {object} entry
   * @returns {void}
   */
  function logAudit(entry) {
    const store = getUserStore();
    if (!store || typeof store.logAudit !== "function") return;
    try {
      store.logAudit(entry);
    } catch {
      // L'audit ne doit pas bloquer le dump.
    }
  }

  /**
   * @returns {object}
   */
  function getStatus() {
    const cfg = readPostgresBackupConfig();
    const pg = getPostgresConnectionConfig();
    const autoEligible = isLoopbackHost(pg.host);
    const files = listDumpFiles(cfg.folderPath);
    return {
      folderPath: cfg.folderPath || null,
      autoEnabled: Boolean(cfg.autoEnabled),
      autoEligible,
      host: pg.host,
      dailyHour: DAILY_HOUR,
      dailyKeep: DAILY_KEEP,
      monthlyKeep: MONTHLY_KEEP,
      lastRunAt: cfg.lastRunAt,
      lastRunKind: cfg.lastRunKind,
      lastRunStatus: cfg.lastRunStatus,
      lastRunError: cfg.lastRunError,
      lastRunFileName: cfg.lastRunFileName,
      cycleStarted: files.some((row) => row.kind === "daily"),
      files
    };
  }

  /**
   * @param {object} payload
   * @returns {Promise<{ canceled: boolean, folderPath: string|null, config: object }>}
   */
  async function pickFolder(payload = {}) {
    assertCanManage(payload.requesterUsername);
    const win = getMainWindow();
    const result = await dialog.showOpenDialog(win || undefined, {
      title: "Dossier des sauvegardes PostgreSQL",
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true, folderPath: null, config: getStatus() };
    }
    const folderPath = result.filePaths[0];
    const pg = getPostgresConnectionConfig();
    writePostgresBackupConfig({
      folderPath,
      autoEnabled: isLoopbackHost(pg.host)
    });
    logAudit({
      actorUsername: payload.requesterUsername,
      action: "POSTGRES_BACKUP_FOLDER_SET",
      status: "SUCCESS",
      details: { after: { folderPath } }
    });
    return { canceled: false, folderPath, config: getStatus() };
  }

  /**
   * @param {object} payload
   * @returns {object}
   */
  function saveSettings(payload = {}) {
    assertCanManage(payload.requesterUsername);
    const current = readPostgresBackupConfig();
    if (!current.folderPath) {
      throw new Error("Choisissez d'abord un dossier de sauvegarde.");
    }
    const pg = getPostgresConnectionConfig();
    const requested = Boolean(payload.autoEnabled);
    const autoEnabled = requested && isLoopbackHost(pg.host);
    writePostgresBackupConfig({ autoEnabled });
    logAudit({
      actorUsername: payload.requesterUsername,
      action: "POSTGRES_BACKUP_SETTINGS_SAVE",
      status: "SUCCESS",
      details: { after: { autoEnabled } }
    });
    return getStatus();
  }

  /**
   * @returns {Promise<{ success: boolean, path: string|null, error: string|null }>}
   */
  async function openFolder() {
    const folderPath = readPostgresBackupConfig().folderPath;
    if (!folderPath) {
      return { success: false, path: null, error: "Aucun dossier de sauvegarde n'est défini." };
    }
    const error = await shell.openPath(folderPath);
    return { success: !error, path: folderPath, error: error || null };
  }

  /**
   * @returns {Promise<{ canceled: boolean, filePath: string|null, fileName: string|null }>}
   */
  async function pickDumpFile() {
    const win = getMainWindow();
    const current = readPostgresBackupConfig();
    const result = await dialog.showOpenDialog(win || undefined, {
      title: "Choisir une sauvegarde PostgreSQL",
      defaultPath: current.folderPath || undefined,
      properties: ["openFile"],
      filters: [{ name: "Sauvegarde PostgreSQL", extensions: ["dump"] }]
    });
    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true, filePath: null, fileName: null };
    }
    const filePath = result.filePaths[0];
    if (!isPgDumpCustomFormat(filePath)) {
      throw new Error("Ce fichier n'est pas une sauvegarde PostgreSQL valide (.dump).");
    }
    return { canceled: false, filePath, fileName: path.basename(filePath) };
  }

  /**
   * @param {object} options
   * @param {string} options.destPath
   * @param {"daily"|"manual"} options.kind
   * @param {string} options.actorUsername
   * @param {boolean} [options.updateRotation]
   * @returns {Promise<object>}
   */
  async function runDumpToDestination(options) {
    const destPath = path.resolve(String(options.destPath || "").trim());
    const kind = options.kind === "daily" ? "daily" : "manual";
    const actorUsername = String(options.actorUsername || SCHEDULER_ACTOR);
    const updateRotation = Boolean(options.updateRotation);
    if (busy) {
      throw new Error(BUSY_ERROR);
    }
    if (!destPath.toLowerCase().endsWith(DUMP_EXT)) {
      throw new Error("Le fichier de sauvegarde doit être au format .dump.");
    }
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const probe = await probePostgresLab();
    if (!probe.reachable) {
      throw new Error("PostgreSQL est injoignable : impossible de créer une sauvegarde.");
    }

    const now = new Date();
    const fileName = path.basename(destPath);
    const pg = getPostgresConnectionConfig();
    const current = readPostgresBackupConfig();

    busy = true;
    try {
      await dumpDatabase(pg, destPath);
      let monthlyName = null;
      if (updateRotation && current.folderPath) {
        const monthKey = localMonthKey(now);
        if (current.lastMonthlyKey !== monthKey) {
          monthlyName = dumpFileNameForKind("monthly", now);
          fs.copyFileSync(destPath, resolveDumpPath(current.folderPath, monthlyName));
          current.lastMonthlyKey = monthKey;
        }
        applyRetention(current.folderPath);
      }
      writePostgresBackupConfig({
        lastDailyKey: updateRotation ? localDateKey(now) : current.lastDailyKey,
        lastMonthlyKey: current.lastMonthlyKey,
        lastRunAt: now.toISOString(),
        lastRunKind: kind,
        lastRunStatus: "ok",
        lastRunError: null,
        lastRunFileName: fileName
      });
      logBackupTechEvent(
        kind === "daily" ? "PG_BACKUP_AUTO_OK" : "PG_BACKUP_MANUAL_OK",
        kind === "daily"
          ? "Sauvegarde journalière PostgreSQL enregistrée."
          : "Sauvegarde manuelle PostgreSQL enregistrée.",
        {
          fileName,
          filePath: destPath,
          monthlyFileName: monthlyName,
          kind,
          actorLabel: reportActorLabel(actorUsername)
        }
      );
      return { success: true, fileName, filePath: destPath, config: getStatus() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "Sauvegarde impossible.");
      writePostgresBackupConfig({
        lastRunAt: now.toISOString(),
        lastRunKind: kind,
        lastRunStatus: "error",
        lastRunError: message
      });
      logBackupTechEvent("PG_BACKUP_FAILED", "Sauvegarde PostgreSQL impossible.", {
        reason: message,
        kind,
        actorLabel: reportActorLabel(actorUsername)
      });
      throw new Error(message);
    } finally {
      busy = false;
    }
  }

  /**
   * @param {"daily"|"manual"} kind
   * @param {string} actorUsername
   * @returns {Promise<object>}
   */
  async function runDump(kind, actorUsername) {
    const current = readPostgresBackupConfig();
    if (!current.folderPath) {
      throw new Error("Choisissez d'abord un dossier de sauvegarde.");
    }
    const now = new Date();
    const fileName = dumpFileNameForKind(kind === "daily" ? "daily" : "manual", now);
    const destPath = resolveDumpPath(current.folderPath, fileName);
    return runDumpToDestination({
      destPath,
      kind,
      actorUsername,
      updateRotation: kind === "daily"
    });
  }

  /**
   * @param {object} payload
   * @returns {Promise<object>}
   */
  async function runManualDump(payload = {}) {
    assertCanManage(payload.requesterUsername);
    return runDump("manual", payload.requesterUsername);
  }

  /**
   * Première journalière + activation du cycle (puis tous les jours à 3 h).
   * Invisible côté UI dès qu'un dump journalier existe dans le dossier.
   *
   * @param {object} payload
   * @returns {Promise<object>}
   */
  async function startBackupCycle(payload = {}) {
    assertCanManage(payload.requesterUsername);
    const current = readPostgresBackupConfig();
    if (!current.folderPath) {
      throw new Error("Choisissez d'abord un dossier de sauvegarde.");
    }
    const pg = getPostgresConnectionConfig();
    if (!isLoopbackHost(pg.host)) {
      throw new Error("Le cycle automatique est réservé au poste qui héberge PostgreSQL (localhost).");
    }
    const files = listDumpFiles(current.folderPath);
    if (files.some((row) => row.kind === "daily")) {
      throw new Error("Le cycle de sauvegardes journalières est déjà lancé.");
    }
    if (!current.autoEnabled) {
      writePostgresBackupConfig({ autoEnabled: true });
    }
    return runDump("daily", payload.requesterUsername);
  }

  /**
   * Dump immédiat vers un chemin choisi (dialogue Enregistrer sous).
   *
   * @param {object} payload
   * @returns {Promise<object>}
   */
  async function runManualDumpSaveAs(payload = {}) {
    assertCanManage(payload.requesterUsername);
    if (busy) {
      throw new Error(BUSY_ERROR);
    }
    const now = new Date();
    const defaultName = dumpFileNameForKind("manual", now);
    const current = readPostgresBackupConfig();
    let defaultPath = defaultName;
    try {
      if (current.folderPath) {
        defaultPath = path.join(current.folderPath, defaultName);
      } else if (app && typeof app.getPath === "function") {
        defaultPath = path.join(app.getPath("documents"), defaultName);
      }
    } catch {
      defaultPath = defaultName;
    }
    const win = getMainWindow();
    const result = await dialog.showSaveDialog(win || undefined, {
      title: "Enregistrer la sauvegarde PostgreSQL",
      defaultPath,
      filters: [{ name: "Sauvegarde PostgreSQL", extensions: ["dump"] }]
    });
    if (result.canceled || !result.filePath) {
      return { canceled: true, fileName: null, filePath: null, config: getStatus() };
    }
    let destPath = result.filePath;
    if (!destPath.toLowerCase().endsWith(DUMP_EXT)) {
      destPath += DUMP_EXT;
    }
    const dumped = await runDumpToDestination({
      destPath,
      kind: "manual",
      actorUsername: payload.requesterUsername,
      updateRotation: false
    });
    return { canceled: false, ...dumped };
  }

  /**
   * @param {object} payload
   * @returns {string}
   */
  function resolveExistingDumpPath(payload = {}) {
    const current = readPostgresBackupConfig();
    let srcPath = String(payload.filePath || "").trim();
    const fileName = String(payload.fileName || "").trim();
    if (!srcPath && fileName) {
      if (!current.folderPath) {
        throw new Error("Aucun dossier de sauvegarde n'est défini.");
      }
      srcPath = resolveDumpPath(current.folderPath, fileName);
    }
    if (!srcPath || !fs.existsSync(srcPath)) {
      throw new Error("Fichier de sauvegarde introuvable.");
    }
    if (!isPgDumpCustomFormat(srcPath)) {
      throw new Error("Ce fichier n'est pas une sauvegarde PostgreSQL valide (.dump).");
    }
    return srcPath;
  }

  /**
   * @param {object} payload
   * @returns {Promise<{ success: boolean, fileName: string, reportHtmlPath: string|null }>}
   */
  async function restoreBackup(payload = {}) {
    const requesterUsername = String(payload.requesterUsername || SCHEDULER_ACTOR).trim() || SCHEDULER_ACTOR;
    if (requesterUsername !== SCHEDULER_ACTOR && requesterUsername !== "system:pg-bootstrap") {
      assertCanManage(requesterUsername);
    }
    if (busy) {
      throw new Error(BUSY_ERROR);
    }

    const srcPath = resolveExistingDumpPath(payload);
    const probe = await probePostgresLab();
    if (!probe.reachable) {
      throw new Error("PostgreSQL est injoignable. Démarrez Docker / le serveur, puis relancez la restauration.");
    }

    const pg = getPostgresConnectionConfig();
    const store = getUserStore();
    busy = true;
    try {
      const before = await captureRestoreSnapshot(pg);
      if (store && typeof store.close === "function") {
        await store.close().catch(() => {});
      }
      try {
        await terminateOtherBackends(pg);
      } catch {
        // Connexions déjà coupées après close().
      }
      await restoreDatabase(pg, srcPath);
      if (postgresAdmin && typeof postgresAdmin.reconnect === "function") {
        const reconnect = await postgresAdmin.reconnect();
        if (!reconnect.reachable) {
          throw new Error(reconnect.error || "Restauration terminée, mais la reconnexion applicative a échoué.");
        }
      }
      const after = await captureRestoreSnapshot(pg);
      let reportHtmlPath = null;
      try {
        const reports = writeRestoreDiffReports({
          dumpPath: srcPath,
          actorLabel: reportActorLabel(requesterUsername),
          before,
          after
        });
        reportHtmlPath = reports.htmlPath;
        if (reportHtmlPath && shell && typeof shell.openPath === "function") {
          await shell.openPath(reportHtmlPath).catch(() => "");
        }
      } catch (reportError) {
        logBackupTechEvent(
          "PG_BACKUP_RESTORE_REPORT_FAILED",
          "Restauration OK, mais le rapport d'écarts n'a pas pu être écrit.",
          {
            reason: reportError instanceof Error ? reportError.message : String(reportError || ""),
            fileName: path.basename(srcPath),
            actorLabel: reportActorLabel(requesterUsername)
          }
        );
      }
      logBackupTechEvent("PG_BACKUP_RESTORE_OK", "Restauration PostgreSQL terminée.", {
        fileName: path.basename(srcPath),
        reportHtmlPath,
        actorLabel: reportActorLabel(requesterUsername)
      });
      return {
        success: true,
        fileName: path.basename(srcPath),
        reportHtmlPath
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "Restauration impossible.");
      logBackupTechEvent("PG_BACKUP_RESTORE_FAILED", "Restauration PostgreSQL impossible.", {
        reason: message,
        actorLabel: reportActorLabel(requesterUsername)
      });
      try {
        if (postgresAdmin && typeof postgresAdmin.reconnect === "function") {
          await postgresAdmin.reconnect();
        }
      } catch {
        // ignore
      }
      throw new Error(message);
    } finally {
      busy = false;
    }
  }

  /**
   * Compare le dump à la base actuelle via une base temporaire (live intacte).
   *
   * @param {object} payload
   * @returns {Promise<{ success: boolean, fileName: string, reportHtmlPath: string, totals: object }>}
   */
  async function compareBackup(payload = {}) {
    const requesterUsername = String(payload.requesterUsername || SCHEDULER_ACTOR).trim() || SCHEDULER_ACTOR;
    if (requesterUsername !== SCHEDULER_ACTOR && requesterUsername !== "system:pg-bootstrap") {
      assertCanManage(requesterUsername);
    }
    if (busy) {
      throw new Error(BUSY_ERROR);
    }

    const srcPath = resolveExistingDumpPath(payload);
    const probe = await probePostgresLab();
    if (!probe.reachable) {
      throw new Error("PostgreSQL est injoignable. Démarrez Docker / le serveur, puis relancez la comparaison.");
    }

    const pg = getPostgresConnectionConfig();
    busy = true;
    try {
      const compared = await runDumpCompare({
        cfg: pg,
        dumpPath: srcPath,
        actorLabel: reportActorLabel(requesterUsername),
        restoreIntoDatabase: (database) => restoreDatabase(pg, srcPath, { database, clean: false })
      });
      if (compared.htmlPath && shell && typeof shell.openPath === "function") {
        await shell.openPath(compared.htmlPath).catch(() => "");
      }
      logBackupTechEvent("PG_BACKUP_COMPARE_OK", "Comparaison dump / base actuelle terminée.", {
        fileName: path.basename(srcPath),
        reportHtmlPath: compared.htmlPath,
        lost: compared.totals.lost,
        recovered: compared.totals.recovered,
        changed: compared.totals.changed,
        actorLabel: reportActorLabel(requesterUsername)
      });
      return {
        success: true,
        fileName: path.basename(srcPath),
        reportHtmlPath: compared.htmlPath,
        totals: compared.totals
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "Comparaison impossible.");
      logBackupTechEvent("PG_BACKUP_COMPARE_FAILED", "Comparaison dump / base actuelle impossible.", {
        reason: message,
        actorLabel: reportActorLabel(requesterUsername)
      });
      throw new Error(message);
    } finally {
      busy = false;
    }
  }

  /**
   * Dump journalier à 3 h (rattrapage si la veille a été manquée). No-op hors localhost.
   *
   * @returns {Promise<void>}
   */
  async function tickScheduler() {
    if (busy) return;
    const current = readPostgresBackupConfig();
    if (!current.autoEnabled || !current.folderPath) return;
    const pg = getPostgresConnectionConfig();
    if (!isLoopbackHost(pg.host)) return;

    const now = new Date();
    const today = localDateKey(now);
    const yesterdayDate = new Date(now.getTime());
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = localDateKey(yesterdayDate);
    const missedDays = Boolean(current.lastDailyKey) && current.lastDailyKey < yesterday;
    const afterHour = now.getHours() >= DAILY_HOUR;
    if (current.lastDailyKey === today) return;
    if (!afterHour && !missedDays) return;

    try {
      await runDump("daily", SCHEDULER_ACTOR);
    } catch {
      // Déjà journalisé.
    }
  }

  /**
   * @returns {void}
   */
  function startScheduler() {
    stopScheduler();
    void tickScheduler();
    schedulerTimer = setInterval(() => {
      void tickScheduler();
    }, SCHEDULER_INTERVAL_MS);
  }

  /**
   * @returns {void}
   */
  function stopScheduler() {
    if (schedulerTimer) {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    }
  }

  return {
    getStatus,
    pickFolder,
    saveSettings,
    openFolder,
    pickDumpFile,
    runManualDump,
    runManualDumpSaveAs,
    startBackupCycle,
    restoreBackup,
    compareBackup,
    startScheduler,
    stopScheduler
  };
}

module.exports = {
  createPostgresBackupService
};
