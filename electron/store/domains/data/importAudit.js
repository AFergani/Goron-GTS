/**
 * Audit et rapport fichier des imports en masse (sites, intervenants, types d'anomalie).
 *
 * Un log agrégé des réussites (`DATA_IMPORT_BATCH_RESULT`) et, s'il y a des
 * échecs, un log agrégé (`DATA_IMPORT_BATCH_ERROR_SUMMARY`). Détail terrain
 * optionnel dans `{userData}/logs/Import_error.txt`.
 *
 * @module electron/store/domains/data/importAudit
 */

const fs = require("node:fs");
const path = require("node:path");
const { actorName } = require("../../core/actorName");

const FILE_REPORT_TARGETS = new Set(["sites", "intervenants", "types"]);
const SITE_CODE_KEYS = ["code site", "code", "code_site", "site code"];
const SITE_NAME_KEYS = ["site", "nom site", "name", "nom", "site name"];
const INTERVENANT_NAME_KEYS = [
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
];
const TYPE_LABEL_KEYS = ["label", "libelle", "type", "type anomalie"];
const TARGET_FILE_LABELS = {
  sites: "sites",
  intervenants: "intervenants",
  types: "types d'anomalie"
};

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
 * @param {object|null|undefined} row
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
 * @param {Map<string, unknown>} normalized
 * @param {string[]} keys
 * @returns {string}
 */
function readFromNormalizedMap(normalized, keys) {
  for (const rawKey of keys) {
    const key = normalizeImportRowHeaderKey(rawKey);
    if (!key) continue;
    const text = String(normalized.get(key) ?? "").trim();
    if (text) return text;
  }
  return "";
}

/**
 * Résumé lisible d'une ligne refusée (journal d'actions + Import_error.txt).
 *
 * @param {string} target - `sites`, `intervenants`, `types`.
 * @param {object|null|undefined} row
 * @returns {string}
 */
function formatRejectedRowSummary(target, row) {
  const targetNorm = String(target || "").trim().toLowerCase();
  const map = buildNormalizedImportRowMap(row);
  if (targetNorm === "sites") {
    const code = readFromNormalizedMap(map, SITE_CODE_KEYS);
    const name = readFromNormalizedMap(map, SITE_NAME_KEYS);
    return `code site: ${code || "N/A"} · nom site: ${name || "N/A"}`;
  }
  if (targetNorm === "intervenants") {
    const name = readFromNormalizedMap(map, INTERVENANT_NAME_KEYS);
    return `nom / société: ${name || "N/A"}`;
  }
  if (targetNorm === "types") {
    const label = readFromNormalizedMap(map, TYPE_LABEL_KEYS);
    return `libellé: ${label || "N/A"}`;
  }
  const parts = [];
  for (const [rawKey, rawValue] of Object.entries(row && typeof row === "object" ? row : {})) {
    const text = String(rawValue ?? "").trim();
    if (!text) continue;
    parts.push(`${String(rawKey).trim()}: ${text}`);
    if (parts.length >= 4) break;
  }
  return parts.length ? parts.join(" · ") : "";
}

/**
 * @param {string} [userDataPath]
 * @returns {{ logsDir: string, filePath: string }}
 */
function resolveImportErrorLogPath(userDataPath) {
  const base = String(userDataPath || "").trim() || path.join(process.cwd(), "data");
  const logsDir = path.join(base, "logs");
  return { logsDir, filePath: path.join(logsDir, "Import_error.txt") };
}

/**
 * Append un rapport des lignes rejetées (sites, intervenants, types).
 *
 * @param {object} options
 * @param {string} [options.userDataPath]
 * @param {string} options.actor
 * @param {string} options.target
 * @param {string} options.fileName
 * @param {Array<{ rowIndex?: number, message?: string, row?: object }>} options.errorEntries
 * @returns {void}
 */
function appendImportErrorFile({ userDataPath, actor, target, fileName, errorEntries }) {
  const rows = Array.isArray(errorEntries) ? errorEntries : [];
  if (!rows.length) return;

  const targetNorm = String(target || "").trim().toLowerCase();
  if (!FILE_REPORT_TARGETS.has(targetNorm)) return;

  const cible = TARGET_FILE_LABELS[targetNorm] || targetNorm;
  const lines = [
    `[${new Date().toLocaleString("fr-FR")}] Import ${cible} — lignes en échec`,
    `Utilisateur: ${String(actor || "unknown")}`,
    `Fichier: ${String(fileName || "inconnu")}`,
    "Détails des lignes rejetées:"
  ];
  for (const entry of rows) {
    const row = entry?.row && typeof entry.row === "object" ? entry.row : {};
    const reason = String(entry?.message || "Erreur inconnue").trim();
    const lineNo = Number(entry?.rowIndex) || 0;
    const summary = formatRejectedRowSummary(targetNorm, row) || "N/A";
    lines.push(`- ligne ${lineNo} | ${summary} | cause: ${reason}`);
  }
  lines.push("");

  const { logsDir, filePath } = resolveImportErrorLogPath(userDataPath);
  fs.mkdirSync(logsDir, { recursive: true });
  fs.appendFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

/**
 * Journalise un import en masse : au plus 2 lignes d'audit par fichier
 * (récap réussites + récap erreurs si `failed` > 0).
 *
 * @param {import('../../../userStore')} store
 * @param {object} payload
 * @param {string} payload.requesterRole
 * @param {string} payload.requesterUsername
 * @param {string} payload.target
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
  const actor = actorName(requesterUsername);
  const targetName = String(target || "");
  const file = String(fileName || "");
  const totalCount = Number(total) || 0;
  const successCount = Number(success) || 0;
  const failedCount = Number(failed) || 0;
  const normalizedErrorEntries = Array.isArray(errorEntries) ? errorEntries : [];

  store.logAudit({
    actorUsername: actor,
    action: "DATA_IMPORT_BATCH_RESULT",
    status: "SUCCESS",
    details: {
      target: targetName,
      fileName: file,
      total: totalCount,
      success: successCount,
      failed: failedCount
    }
  });

  if (failedCount > 0) {
    const topErrors = normalizedErrorEntries.slice(0, 20).map((entry) => {
      const rowSummary = formatRejectedRowSummary(targetName, entry?.row);
      return {
        rowIndex: Number(entry?.rowIndex) || 0,
        message: String(entry?.message || "Erreur inconnue"),
        ...(rowSummary ? { rowSummary } : {})
      };
    });
    store.logAudit({
      actorUsername: actor,
      action: "DATA_IMPORT_BATCH_ERROR_SUMMARY",
      status: "ERROR",
      details: {
        target: targetName,
        fileName: file,
        total: totalCount,
        failed: failedCount,
        errorCount: normalizedErrorEntries.length,
        topErrors
      }
    });
  }

  try {
    appendImportErrorFile({
      userDataPath: store.userDataPath,
      actor,
      target: targetName,
      fileName: file,
      errorEntries: normalizedErrorEntries
    });
  } catch (error) {
    store.logError({
      source: "data:import:error-file",
      code: "DATA_IMPORT_ERROR_FILE_WRITE_FAILED",
      messageFr: "Impossible d'écrire le rapport d'erreurs d'import.",
      details: {
        target: targetName,
        fileName: file,
        reason: error instanceof Error ? error.message : String(error || "Erreur inconnue")
      }
    });
  }
  return { success: true };
}

module.exports = {
  logBulkImportAudit
};
