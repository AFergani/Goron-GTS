/**
 * Audit et rapport fichier des imports en masse (sites, intervenants).
 *
 * Conforme aux règles projet : un log agrégé par lot (`DATA_IMPORT_BATCH_RESULT`),
 * un log par ligne en échec sans PII brute dans `audit_logs` (`DATA_IMPORT_BATCH_ROW_ERROR`),
 * détail terrain optionnel dans `logs/Import_error.txt` à côté de la base.
 */

const fs = require("node:fs");
const path = require("node:path");

/**
 * Normalise un en-tête de colonne Excel (accents, casse, séparateurs).
 *
 * @param {unknown} value
 * @returns {string}
 */
function normalizeImportRowHeaderKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * @param {object|null|undefined} row - Ligne brute importée.
 * @returns {Map<string, unknown>}
 */
function buildNormalizedImportRowMap(row) {
  const normalized = new Map();
  if (!row || typeof row !== "object") return normalized;
  for (const [rawKey, rawValue] of Object.entries(row)) {
    const key = normalizeImportRowHeaderKey(rawKey);
    if (!key || normalized.has(key)) continue;
    normalized.set(key, rawValue);
  }
  return normalized;
}

/**
 * Lit la première valeur non vide parmi plusieurs libellés de colonnes possibles.
 *
 * @param {object} row
 * @param {string[]} keys - Alias d'en-têtes (ex. `code site`, `nom`).
 * @returns {string}
 */
function readImportRowText(row, keys) {
  const normalized = buildNormalizedImportRowMap(row);
  for (const rawKey of keys) {
    const key = normalizeImportRowHeaderKey(rawKey);
    if (!key) continue;
    const value = normalized.get(key);
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

/**
 * @param {string} dbPath - Chemin de la base active.
 * @returns {{ logsDir: string, filePath: string }}
 */
function resolveImportErrorLogPath(dbPath) {
  const dbDir = String(dbPath || "").trim() ? path.dirname(dbPath) : path.join(process.cwd(), "data");
  const logsDir = path.join(dbDir, "logs");
  return { logsDir, filePath: path.join(logsDir, "Import_error.txt") };
}

/**
 * Append un rapport lisible des lignes rejetées (sites ou intervenants uniquement).
 *
 * @param {object} options
 * @param {string} options.dbPath
 * @param {string} options.actor
 * @param {string} options.target - `sites` ou `intervenants`.
 * @param {string} options.fileName
 * @param {Array<{ rowIndex?: number, message?: string, row?: object }>} options.errorEntries
 * @returns {void}
 */
function appendImportErrorFile({ dbPath, actor, target, fileName, errorEntries }) {
  const rows = Array.isArray(errorEntries) ? errorEntries : [];
  if (!rows.length) return;

  const targetNorm = String(target || "").trim().toLowerCase();
  if (targetNorm !== "sites" && targetNorm !== "intervenants") return;

  const lines = [];
  const now = new Date().toISOString();
  const cible = targetNorm === "sites" ? "sites" : "intervenants";

  lines.push(`[${now}] Import ${cible} — lignes en échec`);
  lines.push(`Utilisateur: ${String(actor || "unknown")}`);
  lines.push(`Fichier: ${String(fileName || "inconnu")}`);
  lines.push("Détails des lignes rejetées:");
  for (const entry of rows) {
    const row = entry?.row && typeof entry.row === "object" ? entry.row : {};
    const reason = String(entry?.message || "Erreur inconnue").trim();
    const lineNo = Number(entry?.rowIndex) || 0;
    if (targetNorm === "sites") {
      const code = readImportRowText(row, ["code site", "code", "code_site", "site code"]);
      const name = readImportRowText(row, ["site", "nom site", "name", "nom", "site name"]);
      lines.push(
        `- ligne ${lineNo} | code site: ${code || "N/A"} | nom site: ${name || "N/A"} | cause: ${reason}`
      );
    } else {
      const name = readImportRowText(row, [
        "name",
        "nom",
        "intervenant",
        "intervenants",
        "societe",
        "société",
        "prestataire",
        "entreprise",
        "raison sociale",
        "raison_sociale"
      ]);
      lines.push(`- ligne ${lineNo} | nom / société: ${name || "N/A"} | cause: ${reason}`);
    }
  }
  lines.push("");

  const { logsDir, filePath } = resolveImportErrorLogPath(dbPath);
  fs.mkdirSync(logsDir, { recursive: true });
  fs.appendFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

/**
 * Journalise le résultat d'un import en masse et les erreurs ligne par ligne.
 *
 * @param {import('../userStore')} store
 * @param {object} payload
 * @param {string} payload.requesterRole
 * @param {string} payload.requesterUsername
 * @param {string} payload.target - Cible importée (`sites`, `intervenants`, …).
 * @param {string} payload.fileName
 * @param {number} payload.total
 * @param {number} payload.success
 * @param {number} payload.failed
 * @param {Array<{ rowIndex?: number, message?: string, row?: object }>} [payload.errorEntries]
 * @returns {{ success: true }}
 */
function logBulkImportAudit(store, payload) {
  const {
    requesterRole,
    requesterUsername,
    target,
    fileName,
    total,
    success,
    failed,
    errorEntries = []
  } = payload;
  store.ensureDataManagerRole(requesterRole);
  const actor = requesterUsername || "unknown";
  store.logAudit({
    actorUsername: actor,
    action: "DATA_IMPORT_BATCH_RESULT",
    status: failed > 0 ? "ERROR" : "SUCCESS",
    details: {
      target: String(target || ""),
      fileName: String(fileName || ""),
      total: Number(total) || 0,
      success: Number(success) || 0,
      failed: Number(failed) || 0
    }
  });
  for (const entry of errorEntries) {
    // Pas de données brutes de la ligne (PII potentiels) dans le log d'audit.
    // Seuls l'index, le site identifiant et le motif sont conservés.
    store.logAudit({
      actorUsername: actor,
      action: "DATA_IMPORT_BATCH_ROW_ERROR",
      status: "ERROR",
      details: {
        target: String(target || ""),
        rowIndex: Number(entry?.rowIndex) || 0,
        site: String(entry?.row?.site || entry?.row?.Site || entry?.row?.CODE_SITE || ""),
        message: String(entry?.message || "Erreur inconnue")
      }
    });
  }
  try {
    appendImportErrorFile({
      dbPath: store.dbPath,
      actor,
      target,
      fileName,
      errorEntries
    });
  } catch (error) {
    store.logError({
      source: "data:import:error-file",
      code: "DATA_IMPORT_ERROR_FILE_WRITE_FAILED",
      messageFr: "Impossible d'écrire le rapport d'erreurs d'import.",
      details: {
        target: String(target || ""),
        fileName: String(fileName || ""),
        reason: error instanceof Error ? error.message : String(error || "Erreur inconnue")
      }
    });
  }
  return { success: true };
}

module.exports = {
  logBulkImportAudit
};
