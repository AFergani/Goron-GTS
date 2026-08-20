/**
 * Journal local des événements PostgreSQL (perte / retour de connexion) — par poste.
 *
 * Fichier append-only JSON Lines : `{userData}/gts-pg-events.log`.
 * Écriture : `postgresLabMonitor`. Lecture : journal technique Paramètres.
 *
 * @module electron/store/persistence/postgresEventLog
 */

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_FILE_NAME = "gts-pg-events.log";
const MAX_READ_LINES = 500;

/**
 * @param {unknown} value
 * @returns {object|null}
 */
function normalizeDetails(value) {
  return value && typeof value === "object" ? value : null;
}

/**
 * Résout le chemin du fichier journal.
 *
 * Priorité : `userDataPath` explicite, puis `app.getPath("userData")`,
 * puis `%APPDATA%/goron-gts` (scripts labo hors Electron), puis `cwd/data`.
 *
 * @param {string} [userDataPath]
 * @returns {string}
 */
function resolvePostgresEventLogPath(userDataPath) {
  const explicit = String(userDataPath || "").trim();
  if (explicit) return path.join(explicit, DEFAULT_FILE_NAME);
  try {
    const { app } = require("electron");
    if (app && typeof app.getPath === "function") {
      return path.join(app.getPath("userData"), DEFAULT_FILE_NAME);
    }
  } catch {
    // hors Electron
  }
  const fallbackBase =
    typeof process.env.APPDATA === "string" && process.env.APPDATA
      ? path.join(process.env.APPDATA, "goron-gts")
      : path.join(process.cwd(), "data");
  return path.join(fallbackBase, DEFAULT_FILE_NAME);
}

/**
 * Ajoute une ligne d'événement PG au journal local.
 *
 * @param {object} entry
 * @param {string} entry.code - Ex. `PG_LAB_CONNECTION_LOST`.
 * @param {string} entry.messageFr
 * @param {object} [entry.details]
 * @param {string} [entry.source]
 * @param {string} [filePath] - Surcharge chemin fichier.
 * @returns {void}
 */
function appendPostgresEvent(entry, filePath) {
  const target = filePath || resolvePostgresEventLogPath();
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
  } catch {
    // ignore
  }
  const line = JSON.stringify({
    occurredAt: new Date().toISOString(),
    source: String(entry?.source || "system:postgres"),
    code: String(entry?.code || "PG_EVENT"),
    messageFr: String(entry?.messageFr || ""),
    details: normalizeDetails(entry?.details)
  });
  try {
    fs.appendFileSync(target, `${line}\n`, "utf8");
  } catch {
    // Ne jamais faire échouer le métier pour un journal local.
  }
}

/**
 * Lit les dernières lignes du journal (plus récentes en premier).
 *
 * @param {object} [options]
 * @param {number} [options.limit=200]
 * @param {string} [options.filePath]
 * @returns {Array<{ occurredAt: string, source: string, code: string, messageFr: string, details: object|null }>}
 */
function readPostgresEvents(options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 200, 1), MAX_READ_LINES);
  const target = options.filePath || resolvePostgresEventLogPath();
  if (!fs.existsSync(target)) return [];
  let raw = "";
  try {
    raw = fs.readFileSync(target, "utf8");
  } catch {
    return [];
  }
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const sliced = lines.slice(-limit).reverse();
  const out = [];
  for (const line of sliced) {
    try {
      const parsed = JSON.parse(line);
      out.push({
        occurredAt: String(parsed.occurredAt || ""),
        source: String(parsed.source || ""),
        code: String(parsed.code || ""),
        messageFr: String(parsed.messageFr || ""),
        details: normalizeDetails(parsed.details)
      });
    } catch {
      // ignore lignes corrompues
    }
  }
  return out;
}

module.exports = {
  resolvePostgresEventLogPath,
  appendPostgresEvent,
  readPostgresEvents
};
