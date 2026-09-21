/**
 * Opérations basses de sauvegarde PostgreSQL : dump, restore, fichiers, rétention.
 *
 * Utilisé par `postgresBackupService.js` (planning, dialogues, IPC). Ne pas appeler
 * depuis l'UI : le service reste le point d'entrée.
 *
 * @module electron/main/postgresBackupOps
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { Client } = require("pg");
const { probePostgresLab } = require("../store/persistence/postgresLabProbe");
const {
  DAILY_KEEP,
  MONTHLY_KEEP
} = require("../store/persistence/postgresBackupConfig");
const { appendPostgresEvent } = require("../store/persistence/postgresEventLog");

const DEFAULT_CONTAINER = "goron-pg18";
const DUMP_EXT = ".dump";
/** En-tête binaire d'un dump PostgreSQL `-Fc`. */
const DUMP_MAGIC = "PGDMP";
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

module.exports = {
  isLoopbackHost,
  reportActorLabel,
  logBackupTechEvent,
  dumpFileNameForKind,
  listDumpFiles,
  applyRetention,
  dumpDatabase,
  restoreDatabase,
  terminateOtherBackends,
  resolveDumpPath,
  isPgDumpCustomFormat,
  localDateKey,
  localMonthKey
};
