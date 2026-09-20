/**
 * Préférences locales des sauvegardes PostgreSQL (`gts-pg-backup.json` dans userData).
 * Pas de secret : dossier, planning, dernière exécution.
 *
 * @module electron/store/persistence/postgresBackupConfig
 */

const fs = require("fs");
const path = require("path");

const FILE_NAME = "gts-pg-backup.json";
const DAILY_HOUR = 3;
const DAILY_KEEP = 14;
const MONTHLY_KEEP = 12;

/**
 * @typedef {{
 *   folderPath: string,
 *   autoEnabled: boolean,
 *   lastDailyKey: string,
 *   lastMonthlyKey: string,
 *   lastRunAt: string|null,
 *   lastRunKind: "daily"|"monthly"|"manual"|null,
 *   lastRunStatus: "ok"|"error"|null,
 *   lastRunError: string|null,
 *   lastRunFileName: string|null
 * }} PostgresBackupConfig
 */

/**
 * @returns {string}
 */
function resolveBackupConfigPath() {
  try {
    const { app } = require("electron");
    return path.join(app.getPath("userData"), FILE_NAME);
  } catch {
    return path.join(process.cwd(), "data", FILE_NAME);
  }
}

/**
 * @returns {PostgresBackupConfig}
 */
function emptyConfig() {
  return {
    folderPath: "",
    autoEnabled: false,
    lastDailyKey: "",
    lastMonthlyKey: "",
    lastRunAt: null,
    lastRunKind: null,
    lastRunStatus: null,
    lastRunError: null,
    lastRunFileName: null
  };
}

/**
 * @param {unknown} raw
 * @returns {PostgresBackupConfig}
 */
function sanitizeConfig(raw) {
  const base = emptyConfig();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const folderPath = String(raw.folderPath || "").trim();
  const lastRunKind = raw.lastRunKind;
  const lastRunStatus = raw.lastRunStatus;
  return {
    folderPath,
    autoEnabled: Boolean(raw.autoEnabled) && Boolean(folderPath),
    lastDailyKey: String(raw.lastDailyKey || "").trim(),
    lastMonthlyKey: String(raw.lastMonthlyKey || "").trim(),
    lastRunAt: typeof raw.lastRunAt === "string" && raw.lastRunAt ? raw.lastRunAt : null,
    lastRunKind: lastRunKind === "daily" || lastRunKind === "monthly" || lastRunKind === "manual" ? lastRunKind : null,
    lastRunStatus: lastRunStatus === "ok" || lastRunStatus === "error" ? lastRunStatus : null,
    lastRunError: typeof raw.lastRunError === "string" && raw.lastRunError ? raw.lastRunError : null,
    lastRunFileName: typeof raw.lastRunFileName === "string" && raw.lastRunFileName ? raw.lastRunFileName : null
  };
}

/**
 * @returns {PostgresBackupConfig}
 */
function readPostgresBackupConfig() {
  const filePath = resolveBackupConfigPath();
  if (!fs.existsSync(filePath)) return emptyConfig();
  try {
    return sanitizeConfig(JSON.parse(fs.readFileSync(filePath, "utf-8")));
  } catch {
    return emptyConfig();
  }
}

/**
 * @param {Partial<PostgresBackupConfig>} patch
 * @returns {PostgresBackupConfig}
 */
function writePostgresBackupConfig(patch) {
  const next = sanitizeConfig({ ...readPostgresBackupConfig(), ...patch });
  const filePath = resolveBackupConfigPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

module.exports = {
  DAILY_HOUR,
  DAILY_KEEP,
  MONTHLY_KEEP,
  readPostgresBackupConfig,
  writePostgresBackupConfig
};
