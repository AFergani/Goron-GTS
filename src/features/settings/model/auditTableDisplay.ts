/**
 * Libellés et regroupements d’affichage du journal d’actions.
 *
 * Utilisé par `AuditTable` (fusion des lots d’import, tons de statut).
 * `mapImportErrorEntry` est aussi consommé par `auditOldValuesTooltip`.
 */

import type { AuditLog } from "../../../types";
import { formatAuditActionLabelOrUnknown } from "./auditActionLabels";

function stripAuditFamilyPrefix(label: string) {
  return label.replace(/^\[[^\]]+\]\s*/, "");
}

/**
 * Classe CSS du badge famille (page métier).
 *
 * @param family - Libellé famille déjà résolu
 * @returns Suffixe de classe (`main-courante`, `fransor`, `data`, `users`, `system`)
 */
export function auditFamilyBadgeTone(family: string) {
  const normalized = family.trim().toLowerCase();
  if (normalized === "main courante") return "main-courante";
  if (normalized === "fransor") return "fransor";
  if (normalized === "référentiels" || normalized === "referentiels") return "data";
  if (normalized === "utilisateurs") return "users";
  return "system";
}

/**
 * Infobulle acteur si une cible utilisateur distincte est présente.
 *
 * @param log - Ligne d’audit
 * @returns Texte `Cible: …`, ou `undefined`
 */
export function buildActorTooltip(log: AuditLog) {
  const target = String(log.targetUsername || "").trim();
  if (!target || target === "-") return undefined;
  return `Cible: ${target}`;
}

/**
 * Ton visuel du statut d’une action (succès / erreur / autre).
 *
 * @param status - Statut brut journalisé
 * @returns `ok`, `error` ou `warn`
 */
export function getAuditStatusTone(status: string) {
  const normalized = String(status || "").trim().toUpperCase();
  if (normalized === "SUCCESS" || normalized === "OK") return "ok";
  if (normalized === "ERROR" || normalized === "KO" || normalized === "FAILED") return "error";
  return "warn";
}

/**
 * Libellé métier de la colonne « Donnée », sans préfixe `[Page]`.
 *
 * @param log - Ligne d’audit
 * @returns Texte affiché (import : nom de fichier)
 */
export function getAuditActionText(log: AuditLog): string {
  const baseLabel = stripAuditFamilyPrefix(formatAuditActionLabelOrUnknown(log.action));
  const details = (log.details || {}) as { fileName?: unknown };
  if (log.action === "DATA_IMPORT_BATCH_RESULT" || log.action === "DATA_IMPORT_BATCH_ERROR_SUMMARY") {
    const fileName = String(details.fileName || "").trim();
    if (fileName) return `Import en masse: ${fileName}`;
  }
  return baseLabel;
}

type ImportBatchErrorEntry = {
  rowIndex: number;
  message: string;
  /** Contenu utile de la ligne refusée (ex. code + nom site). */
  rowSummary?: string;
};

type ImportBatchDetails = {
  target: string;
  fileName: string;
  total: number;
  success: number;
  failed: number;
  topErrors: ImportBatchErrorEntry[];
};

/**
 * Lit une entrée d'erreur d'import depuis les détails d'audit.
 *
 * @param {{ rowIndex?: unknown; message?: unknown; rowSummary?: unknown }} entry
 * @returns {ImportBatchErrorEntry}
 */
export function mapImportErrorEntry(entry: {
  rowIndex?: unknown;
  message?: unknown;
  rowSummary?: unknown;
}): ImportBatchErrorEntry {
  const rowSummary = String(entry?.rowSummary || "").trim();
  return {
    rowIndex: Number(entry?.rowIndex) || 0,
    message: String(entry?.message || "Erreur inconnue").trim(),
    ...(rowSummary ? { rowSummary } : {})
  };
}

type AuditDisplayRow =
  | { kind: "single"; key: string; log: AuditLog }
  | {
      kind: "import";
      key: string;
      occurredAt: string;
      actorUsername: string;
      resultLog: AuditLog;
      errorLog: AuditLog | null;
      batch: ImportBatchDetails;
    };

function readImportBatchFromLogs(resultLog: AuditLog, errorLog: AuditLog | null): ImportBatchDetails {
  const resultDetails = (resultLog.details || {}) as {
    target?: unknown;
    fileName?: unknown;
    total?: unknown;
    success?: unknown;
    failed?: unknown;
  };
  const errorDetails = (errorLog?.details || {}) as {
    topErrors?: Array<{ rowIndex?: unknown; message?: unknown; rowSummary?: unknown }>;
    failed?: unknown;
    errorCount?: unknown;
  };
  const topErrors = Array.isArray(errorDetails.topErrors)
    ? errorDetails.topErrors.map((entry) => mapImportErrorEntry(entry))
    : [];
  return {
    target: String(resultDetails.target || ""),
    fileName: String(resultDetails.fileName || "").trim() || "fichier",
    total: Number(resultDetails.total) || 0,
    success: Number(resultDetails.success) || 0,
    failed: Number(resultDetails.failed ?? errorDetails.failed ?? errorDetails.errorCount) || 0,
    topErrors
  };
}

function getImportPairKey(log: AuditLog): string {
  const details = (log.details || {}) as { fileName?: unknown; target?: unknown };
  return `${String(log.actorUsername || "")}|${String(details.target || "")}|${String(details.fileName || "")}`;
}

/**
 * Regroupe résultat + résumé d'erreurs d'un même import en une seule ligne d'affichage.
 * Les écritures audit restent 2 lignes en base (règle projet) ; seule l'UI est fusionnée.
 *
 * @param logs - Journal brut (ordre d’affichage conservé)
 * @returns Lignes simples ou lots d’import fusionnés
 */
export function buildAuditDisplayRows(logs: AuditLog[]): AuditDisplayRow[] {
  const consumed = new Set<number>();
  const rows: AuditDisplayRow[] = [];

  for (let i = 0; i < logs.length; i += 1) {
    if (consumed.has(i)) continue;
    const log = logs[i];
    const isImportResult = log.action === "DATA_IMPORT_BATCH_RESULT";
    const isImportError = log.action === "DATA_IMPORT_BATCH_ERROR_SUMMARY";

    if (!isImportResult && !isImportError) {
      rows.push({ kind: "single", key: `single-${log.occurredAt}-${i}`, log });
      continue;
    }

    const pairKey = getImportPairKey(log);
    let resultIdx = isImportResult ? i : -1;
    let errorIdx = isImportError ? i : -1;

    for (let j = 0; j < logs.length; j += 1) {
      if (j === i || consumed.has(j)) continue;
      const other = logs[j];
      if (getImportPairKey(other) !== pairKey) continue;
      if (isImportResult && other.action === "DATA_IMPORT_BATCH_ERROR_SUMMARY") {
        errorIdx = j;
        break;
      }
      if (isImportError && other.action === "DATA_IMPORT_BATCH_RESULT") {
        resultIdx = j;
        break;
      }
    }

    if (resultIdx < 0) {
      // Entrée erreurs orpheline : afficher quand même une ligne synthétique.
      const orphan = logs[i];
      const details = (orphan.details || {}) as {
        target?: unknown;
        fileName?: unknown;
        total?: unknown;
        failed?: unknown;
        errorCount?: unknown;
        topErrors?: Array<{ rowIndex?: unknown; message?: unknown; rowSummary?: unknown }>;
      };
      const topErrors = Array.isArray(details.topErrors)
        ? details.topErrors.map((entry) => mapImportErrorEntry(entry))
        : [];
      const failed = Number(details.failed ?? details.errorCount) || topErrors.length;
      rows.push({
        kind: "import",
        key: `import-orphan-${orphan.occurredAt}-${i}`,
        occurredAt: orphan.occurredAt,
        actorUsername: orphan.actorUsername,
        resultLog: orphan,
        errorLog: orphan,
        batch: {
          target: String(details.target || ""),
          fileName: String(details.fileName || "").trim() || "fichier",
          total: Number(details.total) || failed,
          success: 0,
          failed,
          topErrors
        }
      });
      consumed.add(i);
      continue;
    }

    const resultLog = logs[resultIdx];
    const errorLog = errorIdx >= 0 ? logs[errorIdx] : null;
    consumed.add(resultIdx);
    if (errorIdx >= 0) consumed.add(errorIdx);

    rows.push({
      kind: "import",
      key: `import-${resultLog.occurredAt}-${resultIdx}`,
      occurredAt: resultLog.occurredAt,
      actorUsername: resultLog.actorUsername,
      resultLog,
      errorLog,
      batch: readImportBatchFromLogs(resultLog, errorLog)
    });
  }

  return rows;
}

/**
 * Vert = tout OK ; orange = partiel ; rouge = tout refusé.
 *
 * @param batch - Compteurs du lot d’import
 * @returns Ton visuel du statut
 */
export function getImportBatchStatusTone(batch: ImportBatchDetails): "ok" | "warn" | "error" {
  if (batch.failed <= 0) return "ok";
  if (batch.success > 0) return "warn";
  return "error";
}

/**
 * Libellé français du statut d’un lot d’import.
 *
 * @param tone - Ton calculé
 * @returns Phrase affichée dans l’infobulle
 */
export function getImportBatchStatusLabel(tone: "ok" | "warn" | "error"): string {
  if (tone === "ok") return "Tout est bon";
  if (tone === "warn") return "Ajustement / contrôle à faire — certaines créations ont été refusées";
  return "Tout a été refusé";
}
