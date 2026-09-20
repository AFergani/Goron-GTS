/**
 * Tableau journal d’actions (libellés référencés, détails avant/après, dates fr-FR).
 */

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AuditLog } from "../../../types";
import {
  formatAuditActionLabelOrUnknown,
  formatAuditStatus,
  resolveAuditFamily
} from "../model/auditActionLabels";

function stripAuditFamilyPrefix(label: string) {
  return label.replace(/^\[[^\]]+\]\s*/, "");
}

function auditFamilyBadgeTone(family: string) {
  const normalized = family.trim().toLowerCase();
  if (normalized === "main courante") return "main-courante";
  if (normalized === "fransor") return "fransor";
  if (normalized === "référentiels" || normalized === "referentiels") return "data";
  if (normalized === "utilisateurs") return "users";
  return "system";
}

function buildActorTooltip(log: AuditLog) {
  const target = String(log.targetUsername || "").trim();
  if (!target || target === "-") return undefined;
  return `Cible: ${target}`;
}

function getAuditStatusTone(status: string) {
  const normalized = String(status || "").trim().toUpperCase();
  if (normalized === "SUCCESS" || normalized === "OK") return "ok";
  if (normalized === "ERROR" || normalized === "KO" || normalized === "FAILED") return "error";
  return "warn";
}

function isLikelyUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toYesNo(value: unknown) {
  if (value === true || value === 1 || value === "1" || value === "true") return "Oui";
  if (value === false || value === 0 || value === "0" || value === "false") return "Non";
  return "-";
}

function toModeLabel(value: unknown) {
  const raw = String(value || "").toUpperCase();
  if (raw === "OPEN") return "Ouverture";
  if (raw === "CLOSED") return "Fermeture";
  return "-";
}

function toDisplayResponsable(name: unknown, id: unknown) {
  const cleanName = String(name || "").trim();
  if (cleanName) return cleanName;
  const cleanId = String(id || "").trim();
  if (!cleanId || isLikelyUuid(cleanId)) return "-";
  return cleanId;
}

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (Array.isArray(value)) return value.length ? value.map((item) => formatDetailValue(item)).join(", ") : "-";
  if (typeof value === "object") return "[objet]";
  return String(value);
}

function toFrenchDetailKey(key: string): string {
  const normalized = String(key || "").trim();
  const map: Record<string, string> = {
    id: "Identifiant",
    code: "Code",
    name: "Nom",
    label: "Libellé",
    fullName: "Nom affiché",
    username: "Identifiant interne",
    role: "Rôle",
    managerProfile: "Profil responsable",
    isActive: "Actif",
    isLocked: "Verrouillé",
    mustChangePassword: "Mot de passe à changer",
    reason: "Motif",
    dateIso: "Date",
    date: "Date",
    startDate: "Date début",
    endDate: "Date fin",
    mode: "Mode",
    colorHex: "Couleur",
    parc: "Parc",
    famille: "Famille",
    address: "Adresse",
    target: "Cible",
    fileName: "Fichier",
    folderPath: "Dossier",
    autoEnabled: "Sauvegardes automatiques",
    total: "Total",
    success: "Succès",
    failed: "Erreurs",
    errorCount: "Nombre d'erreurs",
    rowIndex: "Ligne",
    message: "Message",
    details: "Détails",
    before: "Avant",
    after: "Après",
    deleted: "Supprimé",
    created: "Créé",
    period: "Période",
    pageAccess: "Accès pages",
    mainCourante: "Main courante",
    fransor: "Fransor",
    intervention: "Intervention",
    rondes: "Rondes",
    settings: "Paramètres",
    gardiennage: "Gardiennage",
    requiresFreeText: "Texte libre obligatoire",
    ouvertureDone: "Ouverture effectuée",
    fermetureDone: "Fermeture effectuée",
    responsableId: "Responsable (ID)",
    responsableName: "Responsable",
    status: "Statut",
    topErrors: "Principales erreurs",
    relatedUsage: "Utilisations liées"
  };
  const parts = normalized.split(".");
  const translated = parts.map((part) => map[part] || part);
  return translated.join(" > ");
}

function flattenDetails(value: unknown, parentKey = ""): Array<{ key: string; value: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return parentKey ? [{ key: parentKey, value: formatDetailValue(value) }] : [];
  }
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.flatMap(([key, nestedValue]) => {
    const nextKey = parentKey ? `${parentKey}.${key}` : key;
    if (nestedValue && typeof nestedValue === "object" && !Array.isArray(nestedValue)) {
      return flattenDetails(nestedValue, nextKey);
    }
    return [{ key: nextKey, value: formatDetailValue(nestedValue) }];
  });
}

function formatDetailsAsLines(value: unknown): string[] {
  const lines = flattenDetails(value).map((entry) => `${toFrenchDetailKey(entry.key)}: ${entry.value}`);
  return lines.length ? lines : ["-"];
}

function getAuditActionText(log: AuditLog): string {
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
function mapImportErrorEntry(entry: {
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
 */
function buildAuditDisplayRows(logs: AuditLog[]): AuditDisplayRow[] {
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

/** Vert = tout OK ; orange = partiel ; rouge = tout refusé. */
function getImportBatchStatusTone(batch: ImportBatchDetails): "ok" | "warn" | "error" {
  if (batch.failed <= 0) return "ok";
  if (batch.success > 0) return "warn";
  return "error";
}

function getImportBatchStatusLabel(tone: "ok" | "warn" | "error"): string {
  if (tone === "ok") return "Tout est bon";
  if (tone === "warn") return "Ajustement / contrôle à faire — certaines créations ont été refusées";
  return "Tout a été refusé";
}

function formatOldValuesTooltip(log: AuditLog) {
  const detailsAny = (log.details || {}) as Record<string, unknown>;
  const historyBefore = Array.isArray(detailsAny.historyBefore)
    ? (detailsAny.historyBefore as Array<{ changedAt?: unknown; changedBy?: unknown; snapshot?: Record<string, unknown> }>)
    : [];
  const historyText =
    historyBefore.length > 0
      ? [
          "3 derniers changements avant action:",
          ...historyBefore.map((entry, index) => {
            const when = String(entry.changedAt || "-");
            const who = String(entry.changedBy || "-");
            const snapshot = formatDetailsAsLines(entry.snapshot).join(" | ");
            return `${index + 1}) ${when} par ${who}: ${snapshot}`;
          })
        ].join("\n")
      : "";

  if (log.action === "DATA_IMPORT_BATCH_RESULT") {
    const details = (log.details || {}) as {
      target?: unknown;
      fileName?: unknown;
      total?: unknown;
      success?: unknown;
      failed?: unknown;
    };
    return [
      "Résumé import",
      `Cible: ${String(details.target || "-")}`,
      `Fichier: ${String(details.fileName || "-")}`,
      `Total: ${String(details.total ?? 0)}`,
      `Succès: ${String(details.success ?? 0)}`,
      `Erreurs: ${String(details.failed ?? 0)}`
    ].join("\n");
  }
  if (log.action === "DATA_IMPORT_BATCH_ERROR_SUMMARY") {
    const details = (log.details || {}) as {
      target?: unknown;
      fileName?: unknown;
      total?: unknown;
      failed?: unknown;
      errorCount?: unknown;
      topErrors?: Array<{ rowIndex?: unknown; message?: unknown; rowSummary?: unknown }>;
    };
    const topErrors = Array.isArray(details.topErrors) ? details.topErrors : [];
    const topLines = topErrors.slice(0, 20).flatMap((entry) => {
      const mapped = mapImportErrorEntry(entry);
      const lines = [`- ligne ${mapped.rowIndex || "-"}: ${mapped.message}`];
      if (mapped.rowSummary) lines.push(`  contenu refusé: ${mapped.rowSummary}`);
      return lines;
    });
    return [
      "Résumé des erreurs import",
      `Cible: ${String(details.target || "-")}`,
      `Fichier: ${String(details.fileName || "-")}`,
      `Total: ${String(details.total ?? 0)}`,
      `Erreurs: ${String(details.failed ?? details.errorCount ?? 0)}`,
      ...(topLines.length ? ["Détail des erreurs:", ...topLines] : ["Aucune erreur détaillée enregistrée dans ce log."])
    ].join("\n");
  }
  if (log.action.startsWith("DATA_SITE_PENDING_") || log.action.startsWith("DATA_INTERVENANT_PENDING_")) {
    const details = (log.details || {}) as Record<string, unknown>;
    if (log.action.endsWith("_RESOLVE")) {
      const pending = (details.pendingSite || details.pendingIntervenant || {}) as Record<string, unknown>;
      const created = (details.createdSite || details.createdIntervenant || {}) as Record<string, unknown>;
      return [
        "Détails validation d'entrée en attente",
        `Mode: ${String(details.mode || "created")}`,
        `Entrée en attente: ${String(pending.code || pending.name || "-")}`,
        `Entrée référentiel: ${String(created.code || created.name || "-")}`
      ].join("\n");
    }
    if (log.action.endsWith("_DELETE")) {
      const deleted = (details.deleted || details.pendingSite || details.pendingIntervenant || {}) as Record<string, unknown>;
      return [
        "Détails suppression d'entrée en attente",
        `Entrée: ${String(deleted.code || deleted.name || "-")}`,
        `Motif: ${String(details.reason || "-")}`
      ].join("\n");
    }
    const pending = (details.pendingSite || details.pendingIntervenant || {}) as Record<string, unknown>;
    return [
      "Détails proposition en attente",
      `Entrée: ${String(pending.code || pending.name || "-")}`
    ].join("\n");
  }
  if (log.action.startsWith("INTERVENTION_")) {
    const details = (log.details || {}) as Record<string, unknown>;
    const before = (details.before || {}) as Record<string, unknown>;
    const after = (details.after || {}) as Record<string, unknown>;
    if (log.action === "INTERVENTION_CANCEL") {
      return [
        "Détails annulation intervention",
        `Statut avant: ${String(before.status || "-")}`,
        `Statut après: ${String(after.status || "-")}`,
        `Motif: ${String(after.cancellationReason || details.cancellationReason || "-")}`
      ].join("\n");
    }
    if (log.action === "INTERVENTION_CLOSE") {
      return [
        "Détails clôture intervention",
        `Statut avant: ${String(before.status || "-")}`,
        `Statut après: ${String(after.status || "-")}`,
        `Clôturée le: ${String(after.closedAt || "-")}`
      ].join("\n");
    }
    if (log.action === "INTERVENTION_REOPEN") {
      return [
        "Détails réouverture intervention",
        `Statut avant: ${String(before.status || "-")}`,
        `Statut après: ${String(after.status || "-")}`
      ].join("\n");
    }
    if (log.action === "INTERVENTION_UPDATE") {
      return [
        "Détails mise à jour intervention",
        `Site: ${String(after.siteDisplay || "-")}`,
        `Date demande: ${String(after.requestDate || "-")}`,
        `Heure demande: ${String(after.requestTime || "-")}`,
        `Arrivée: ${String(after.arrivalTime || "-")}`,
        `Départ: ${String(after.departureTime || "-")}`,
        `N° bon: ${String(after.workOrderNumber || "-")}`
      ].join("\n");
    }
    if (log.action === "INTERVENTION_CREATE") {
      return [
        "Détails création intervention",
        `Site: ${String(after.siteDisplay || details.siteDisplay || "-")}`,
        `Date demande: ${String(after.requestDate || details.requestDate || "-")}`,
        `Heure demande: ${String(after.requestTime || details.requestTime || "-")}`,
        `Prestataire: ${String(after.intervenantName || details.intervenantName || "-")}`,
        `N° bon: ${String(after.workOrderNumber || details.workOrderNumber || "-")}`
      ].join("\n");
    }
    if (log.action === "INTERVENTION_CREATE_IDEMPOTENT") {
      const existing = (details.existing || {}) as Record<string, unknown>;
      return [
        "Création idempotente (doublon évité)",
        `Site: ${String(existing.siteDisplay || "-")}`,
        `Date demande: ${String(existing.requestDate || "-")}`,
        `Heure demande: ${String(existing.requestTime || "-")}`,
        `Prestataire: ${String(existing.intervenantName || "-")}`,
        `Statut conservé: ${String(existing.status || "-")}`
      ].join("\n");
    }
    return undefined;
  }
  if (log.action.startsWith("FRANSOR_")) {
    const details = (log.details || {}) as Record<string, unknown>;
    const period = details.period as { startDate?: unknown; endDate?: unknown } | undefined;
    const before = details.before as Record<string, unknown> | undefined;
    const after = details.after as Record<string, unknown> | undefined;
    if (log.action === "FRANSOR_CLOSURE_DELETE" || log.action === "FRANSOR_CLOSURE_CREATE" || log.action === "FRANSOR_CLOSURE_UPDATE") {
      const modeValue = details.mode || after?.mode || before?.mode;
      return [
        "Détails exception",
        `Du: ${String(period?.startDate || "-")}`,
        `Au: ${String(period?.endDate || "-")}`,
        `Type: ${toModeLabel(modeValue)}`,
        `Libellé: ${String(details.label || after?.label || "-")}`,
        ...(log.action === "FRANSOR_CLOSURE_UPDATE"
          ? [`Avant: ${String(before?.label || "-")} (${toModeLabel(before?.mode)})`]
          : []),
        ...(log.action === "FRANSOR_CLOSURE_UPDATE"
          ? [`Après: ${String(after?.label || "-")} (${toModeLabel(after?.mode)})`]
          : []),
        ...(log.action === "FRANSOR_CLOSURE_DELETE" ? [`Motif suppression: ${String(details.reason || "-")}`] : [])
      ].join("\n");
    }
    if (log.action === "FRANSOR_ENTRY_CREATE" || log.action === "FRANSOR_ENTRY_UPDATE") {
      const next = after || details;
      return [
        "Détails saisie",
        `Date: ${String(details.date || "-")}`,
        `Responsable: ${toDisplayResponsable(details.responsableName, details.responsableId)}`,
        ...(log.action === "FRANSOR_ENTRY_UPDATE"
          ? [
              `Ouverture: ${toYesNo(before?.ouvertureDone)} => ${toYesNo(next.ouvertureDone ?? details.ouvertureDone)}`,
              `Fermeture: ${toYesNo(before?.fermetureDone)} => ${toYesNo(next.fermetureDone ?? details.fermetureDone)}`
            ]
          : [
              `Ouverture: ${toYesNo(next.ouvertureDone ?? details.ouvertureDone)}`,
              `Fermeture: ${toYesNo(next.fermetureDone ?? details.fermetureDone)}`
            ])
      ].join("\n");
    }
    if (log.action === "FRANSOR_RESPONSABLE_CREATE") {
      return [
        "Détails création responsable",
        `Nom: ${String(details.name || "-")}`
      ].join("\n");
    }
    if (log.action === "FRANSOR_RESPONSABLE_UPDATE") {
      return [
        "Détails modification responsable",
        `Nom: ${String(before?.name || "-")} => ${String(after?.name || "-")}`
      ].join("\n");
    }
    if (log.action === "FRANSOR_RESPONSABLE_DELETE") {
      const deleted = (details.deleted || {}) as Record<string, unknown>;
      return [
        "Détails suppression responsable",
        `Nom: ${String(deleted.name || "-")}`,
        `Motif: ${String(details.reason || "-")}`
      ].join("\n");
    }
    return undefined;
  }
  if (log.action.startsWith("GARDIENNAGE_")) {
    const details = (log.details || {}) as Record<string, unknown>;
    const before = (details.before || {}) as Record<string, unknown>;
    const after = (details.after || {}) as Record<string, unknown>;
    if (log.action === "GARDIENNAGE_CREATE") {
      const created = (details.created || {}) as Record<string, unknown>;
      return [
        "Détails création gardiennage",
        `Site: ${String(created.siteDisplay || "-")}`,
        `Horaires: ${String(created.startTime || "-")} - ${String(created.endTime || "-")}`,
        `Période: ${String(created.recurrenceStartDate || "-")} -> ${String(created.recurrenceEndDate || "-")}`,
        `Ponctuel: ${toYesNo(created.isPonctuel)}`,
        `Prestataire: ${String(created.intervenantName || "-")}`
      ].join("\n");
    }
    if (log.action === "GARDIENNAGE_BATCH_CREATE") {
      const preview = (details.preview || {}) as Record<string, unknown>;
      return [
        "Création en lot gardiennage",
        `Lot: ${String(details.batchId || "-")}`,
        `Total créé: ${String(details.total || "-")}`,
        `Site: ${String(preview.siteDisplay || "-")}`,
        `Horaires: ${String(preview.startTime || "-")} - ${String(preview.endTime || "-")}`,
        `Prestataire: ${String(preview.intervenantName || "-")}`
      ].join("\n");
    }
    if (log.action === "GARDIENNAGE_UPDATE") {
      return [
        "Détails mise à jour gardiennage",
        `Site: ${String(before.siteDisplay || "-")} => ${String(after.siteDisplay || "-")}`,
        `Horaires: ${String(before.startTime || "-")} - ${String(before.endTime || "-")} => ${String(after.startTime || "-")} - ${String(after.endTime || "-")}`,
        `Période: ${String(before.recurrenceStartDate || "-")} -> ${String(before.recurrenceEndDate || "-")} => ${String(after.recurrenceStartDate || "-")} -> ${String(after.recurrenceEndDate || "-")}`,
        `Prestataire: ${String(before.intervenantName || "-")} => ${String(after.intervenantName || "-")}`
      ].join("\n");
    }
    if (log.action === "GARDIENNAGE_BATCH_CANCEL") {
      return [
        "Annulation en lot gardiennage",
        `Lot: ${String(details.batchId || "-")}`,
        `Annulées: ${String(details.cancelledCount || "0")}`,
        `Préservées (clôturées): ${String(details.preservedClosedCount || "0")}`,
        `Motif: ${String(details.reason || "-")}`
      ].join("\n");
    }
    if (log.action === "GARDIENNAGE_DELETE" || log.action === "GARDIENNAGE_BATCH_DELETE") {
      return [
        log.action === "GARDIENNAGE_BATCH_DELETE" ? "Suppression en lot gardiennage" : "Suppression gardiennage",
        `Supprimées: ${String(details.deletedCount || "1")}`,
        `Préservées (clôturées): ${String(details.preservedClosedCount || "0")}`,
        `Motif: ${String(details.reason || "-")}`
      ].join("\n");
    }
    if (log.action === "GARDIENNAGE_STATUS_ANNULE") {
      return [
        "Annulation gardiennage",
        `Statut: ${String(details.before || "-")} => ${String(details.after || "-")}`,
        `Motif: ${String(details.cancellationReason || "-")}`
      ].join("\n");
    }
    if (log.action === "GARDIENNAGE_STATUS_CLOTURE") {
      return [
        "Clôture gardiennage",
        `Site: ${String(details.siteDisplay || "-")}`,
        `Date clôture: ${String(details.closeDate || "-")}`,
        `Compte rendu: ${String(details.closureReport || "-")}`,
        `Horaires réels: ${String(details.actualStartTime || "-")} - ${String(details.actualEndTime || "-")}`
      ].join("\n");
    }
    if (log.action === "GARDIENNAGE_REOPEN") {
      const beforeDetails = (details.before || {}) as Record<string, unknown>;
      const afterDetails = (details.after || {}) as Record<string, unknown>;
      return [
        "Réouverture gardiennage",
        `Statut: ${String(beforeDetails.status || "-")} => ${String(afterDetails.status || "-")}`,
        `Motif annulation: ${String(beforeDetails.cancellationReason || "-")} => ${String(afterDetails.cancellationReason || "-")}`
      ].join("\n");
    }
    return undefined;
  }
  if (log.action.startsWith("RONDE_")) {
    const details = (log.details || {}) as Record<string, unknown>;
    const before = (details.before || {}) as Record<string, unknown>;
    const after = (details.after || {}) as Record<string, unknown>;
    if (log.action === "RONDE_CREATE") {
      const created = (details.created || {}) as Record<string, unknown>;
      return [
        "Détails création ronde",
        `Source: ${String(created.source || "-")}`,
        `Site: ${String(created.siteDisplay || "-")}`,
        `Date demande: ${String(created.requestDate || "-")}`,
        `Motif: ${String(created.motifLabel || "-")}`,
        `Prestataire: ${String(created.intervenantName || "-")}`,
        `Statut: ${String(created.status || "-")}`
      ].join("\n");
    }
    if (log.action === "RONDE_CREATE_IDEMPOTENT") {
      const existing = (details.existing || {}) as Record<string, unknown>;
      return [
        "Création idempotente (doublon évité)",
        `Source: ${String(existing.source || "-")}`,
        `Site: ${String(existing.siteDisplay || "-")}`,
        `Date demande: ${String(existing.requestDate || "-")}`,
        `Motif: ${String(existing.motifLabel || "-")}`,
        `Prestataire: ${String(existing.intervenantName || "-")}`,
        `Statut conservé: ${String(existing.status || "-")}`
      ].join("\n");
    }
    if (log.action === "RONDE_UPDATE") {
      return [
        "Détails mise à jour ronde",
        `Site: ${String(before.siteDisplay || "-")} => ${String(after.siteDisplay || "-")}`,
        `Date demande: ${String(before.requestDate || "-")} => ${String(after.requestDate || "-")}`,
        `Motif: ${String(before.motifLabel || "-")} => ${String(after.motifLabel || "-")}`,
        `Prestataire: ${String(before.intervenantName || "-")} => ${String(after.intervenantName || "-")}`
      ].join("\n");
    }
    if (log.action === "RONDE_CANCEL") {
      return [
        "Détails annulation ronde",
        `Statut avant: ${String(before.status || "-")}`,
        `Statut après: ${String(after.status || "-")}`,
        `Motif: ${String(after.cancellationReason || "-")}`
      ].join("\n");
    }
    if (log.action === "RONDE_CLOSE") {
      return [
        "Détails clôture ronde",
        `Statut avant: ${String(before.status || "-")}`,
        `Statut après: ${String(after.status || "-")}`,
        `Clôturée le: ${String(after.closedAt || "-")}`
      ].join("\n");
    }
    if (log.action === "RONDE_REOPEN") {
      return [
        "Détails réouverture ronde",
        `Statut avant: ${String(before.status || "-")}`,
        `Statut après: ${String(after.status || "-")}`
      ].join("\n");
    }
    if (log.action === "RONDE_BATCH_CREATE") {
      const preview = (details.preview || {}) as Record<string, unknown>;
      return [
        "Création en lot de rondes",
        `Lot: ${String(details.batchId || "-")}`,
        `Total créé: ${String(details.total || "-")}`,
        `Site: ${String(preview.siteDisplay || "-")}`,
        `Date demande: ${String(preview.requestDate || "-")}`,
        `Motif: ${String(preview.motifLabel || "-")}`,
        `Prestataire: ${String(preview.intervenantName || "-")}`
      ].join("\n");
    }
    if (log.action === "RONDE_BATCH_UPDATE") {
      return [
        "Mise à jour en lot de rondes",
        `Nombre de fiches: ${String(details.count || "-")}`,
        `Synchronisation snapshot: ${toYesNo(details.planningSnapshotSynced)}`
      ].join("\n");
    }
    if (log.action === "RONDE_BATCH_CANCEL") {
      return [
        "Annulation en lot de rondes",
        `Annulées: ${String(details.cancelledCount || "0")}`,
        `Ignorées: ${String(details.skippedCount || "0")}`,
        `Motif: ${String(details.reason || "-")}`
      ].join("\n");
    }
    if (log.action === "RONDE_BATCH_DELETE") {
      return [
        "Suppression en lot de rondes",
        `Supprimées: ${String(details.deletedCount || "0")}`,
        `Préservées (clôturées): ${String(details.preservedClosedCount || "0")}`,
        `Motif: ${String(details.reason || "-")}`
      ].join("\n");
    }
    return undefined;
  }
  if (log.action.startsWith("MAIN_COURANTE_")) {
    const details = (log.details || {}) as Record<string, unknown>;
    const before = (details.before || {}) as Record<string, unknown>;
    const after = (details.after || {}) as Record<string, unknown>;
    if (log.action === "MAIN_COURANTE_CREATE") {
      const created = (details.created || {}) as Record<string, unknown>;
      return [
        "Détails création information",
        `Opérateur: ${String(created.operatorName || "-")}`,
        `Site: ${String(created.siteDisplay || "-")}`,
        `Type d'anomalie: ${String(created.anomalyTypeLabel || "-")}`,
        `Information: ${String(created.information || "-")}`,
        `Statut: ${String(created.status || "-")}`
      ].join("\n");
    }
    if (log.action === "MAIN_COURANTE_CREATE_IDEMPOTENT") {
      const existing = (details.existing || {}) as Record<string, unknown>;
      return [
        "Création idempotente (doublon évité)",
        `Opérateur: ${String(existing.operatorName || "-")}`,
        `Site: ${String(existing.siteDisplay || "-")}`,
        `Type d'anomalie: ${String(existing.anomalyTypeLabel || "-")}`,
        `Information: ${String(existing.information || "-")}`,
        `Statut conservé: ${String(existing.status || "-")}`
      ].join("\n");
    }
    if (log.action === "MAIN_COURANTE_UPDATE_OPERATOR") {
      return [
        "Modification opérateur",
        `Site: ${String(before.siteDisplay || "-")} => ${String(after.siteDisplay || "-")}`,
        `Type d'anomalie: ${String(before.anomalyTypeLabel || "-")} => ${String(after.anomalyTypeLabel || "-")}`,
        `Information: ${String(before.information || "-")} => ${String(after.information || "-")}`
      ].join("\n");
    }
    if (log.action === "MAIN_COURANTE_MANAGER_SUIVRE" || log.action === "MAIN_COURANTE_MANAGER_CLOTURE") {
      return [
        "Action manager",
        `Décision: ${String(details.decision || "-")}`,
        `Statut: ${String(before.status || "-")} => ${String(after.status || "-")}`,
        `Responsable: ${String(after.managerName || "-")}`,
        `Prise en compte: ${String(after.priseEnCompteAt || "-")}`,
        `Clôture: ${String(after.closedAt || "-")}`
      ].join("\n");
    }
    if (log.action === "MAIN_COURANTE_MANAGER_REOPEN") {
      return [
        "Réouverture information",
        `Statut: ${String(before.status || "-")} => ${String(after.status || "-")}`,
        `Responsable: ${String(after.managerName || "-")}`,
        `Clôture: ${String(before.closedAt || "-")} => ${String(after.closedAt || "-")}`
      ].join("\n");
    }
    return undefined;
  }
  if (log.action === "USER_CREATE") {
    const created = (detailsAny.created || {}) as Record<string, unknown>;
    return [
      "Création utilisateur",
      `Nom affiché: ${String(created.fullName || "-")}`,
      `Rôle: ${String(created.role || "-")}`,
      `Profil responsable: ${String(created.managerProfile || "-")}`,
      `Actif: ${toYesNo(created.isActive)}`,
      `Mot de passe à changer: ${toYesNo(created.mustChangePassword)}`
    ].join("\n");
  }
  if (log.action === "USER_UPDATE_PROFILE") {
    const before = (detailsAny.before || {}) as Record<string, unknown>;
    const after = (detailsAny.after || {}) as Record<string, unknown>;
    return [
      "Modification utilisateur (avant => après)",
      `Nom affiché: ${String(before.fullName || "-")} => ${String(after.fullName || "-")}`,
      `Rôle: ${String(before.role || "-")} => ${String(after.role || "-")}`,
      `Profil responsable: ${String(before.managerProfile || "-")} => ${String(after.managerProfile || "-")}`,
      `Mot de passe à changer: ${toYesNo(before.mustChangePassword)} => ${toYesNo(after.mustChangePassword)}`,
      `Motif: ${String(detailsAny.reason || "-")}`
    ].join("\n");
  }
  if (log.action === "USER_RESET_PASSWORD") {
    const before = (detailsAny.before || {}) as Record<string, unknown>;
    return [
      "Réinitialisation du mot de passe",
      `Nom affiché: ${String(before.fullName || "-")}`,
      "Mot de passe temporaire généré: Oui",
      `Motif: ${String(detailsAny.reason || "-")}`
    ].join("\n");
  }
  if (log.action === "USER_UNLOCK") {
    return [
      "Déverrouillage de compte",
      `Motif: ${String(detailsAny.reason || "-")}`
    ].join("\n");
  }
  if (log.action === "USER_RESET_PASSWORD_PEER") {
    return [
      "Réinitialisation validée par un collègue présent",
      `Bénéficiaire: ${String(detailsAny.targetFullName || "-")}`,
      `Validée par: ${String(detailsAny.validatedByFullName || "-")}`,
      "Mot de passe temporaire généré: Oui",
      `Motif: ${String(detailsAny.reason || "-")}`
    ].join("\n");
  }
  if (log.action === "USER_DEACTIVATE") {
    const before = (detailsAny.before || {}) as Record<string, unknown>;
    const after = (detailsAny.after || {}) as Record<string, unknown>;
    return [
      "Désactivation utilisateur",
      `Nom affiché: ${String(before.fullName || "-")}`,
      `Actif: ${toYesNo(before.isActive)} => ${toYesNo(after.isActive)}`,
      `Motif: ${String(detailsAny.reason || "-")}`
    ].join("\n");
  }
  if (log.action === "USER_REACTIVATE") {
    const before = (detailsAny.before || {}) as Record<string, unknown>;
    const after = (detailsAny.after || {}) as Record<string, unknown>;
    return [
      "Réactivation utilisateur",
      `Nom affiché: ${String(before.fullName || "-")}`,
      `Actif: ${toYesNo(before.isActive)} => ${toYesNo(after.isActive)}`,
      `Mot de passe temporaire généré: ${toYesNo(detailsAny.passwordResetForced ?? true)}`,
      `Motif: ${String(detailsAny.reason || "-")}`
    ].join("\n");
  }
  if (log.action === "USER_DELETE_HARD") {
    const deleted = (detailsAny.deleted || {}) as Record<string, unknown>;
    return [
      "Désactivation définitive (suppression physique)",
      `Nom affiché: ${String(deleted.fullName || "-")}`,
      `Motif: ${String(detailsAny.reason || "-")}`
    ].join("\n");
  }
  if (log.action === "POSTGRES_BACKUP_FOLDER_SET") {
    const after = (detailsAny.after || detailsAny) as Record<string, unknown>;
    return ["Dossier de sauvegarde", ...formatDetailsAsLines(after)].join("\n");
  }
  if (log.action === "POSTGRES_BACKUP_SETTINGS_SAVE") {
    const after = (detailsAny.after || detailsAny) as Record<string, unknown>;
    return ["Planning automatique", ...formatDetailsAsLines(after)].join("\n");
  }
  if (log.action.endsWith("_CREATE")) {
    const created = detailsAny.created || detailsAny;
    return ["Données créées", ...formatDetailsAsLines(created)].join("\n");
  }
  if (log.action.endsWith("_DELETE")) {
    const deleted = detailsAny.deleted || {};
    const reason = String(detailsAny.reason || "-");
    return ["Données supprimées", ...formatDetailsAsLines(deleted), `Motif: ${reason}`].join("\n");
  }
  if (log.action !== "DATA_SITE_UPDATE" && log.action !== "DATA_INTERVENANT_UPDATE" && log.action !== "DATA_TYPE_UPDATE") {
    if (!historyText) return undefined;
    return historyText;
  }
  const details = log.details as
    | {
        before?: {
          code?: unknown;
          name?: unknown;
          parc?: unknown;
          famille?: unknown;
          label?: unknown;
        };
      }
    | null;
  const before = details?.before;
  if (!before) return undefined;

  if (log.action === "DATA_SITE_UPDATE") {
    const lines = [
      "Anciennes valeurs",
      `Code: ${String(before.code || "-")}`,
      `Nom: ${String(before.name || "-")}`,
      `Parc: ${String(before.parc || "-")}`,
      `Famille: ${String(before.famille || "-")}`
    ];
    if (historyText) lines.push("", historyText);
    return lines.join("\n");
  }
  if (log.action === "DATA_INTERVENANT_UPDATE") {
    const lines = ["Ancienne valeur", `Nom: ${String(before.name || "-")}`];
    if (historyText) lines.push("", historyText);
    return lines.join("\n");
  }
  const lines = ["Ancienne valeur", `Libellé: ${String(before.label || "-")}`];
  if (historyText) lines.push("", historyText);
  return lines.join("\n");
}

export function AuditTable({ logs }: { logs: AuditLog[] }) {
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const displayRows = buildAuditDisplayRows(logs);

  const toggleExpanded = (key: string) => {
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <table className="audit-logs-table">
      <colgroup>
        <col className="audit-col-date" />
        <col className="audit-col-actor" />
        <col className="audit-col-family" />
        <col className="audit-col-data" />
        <col className="audit-col-status" />
      </colgroup>
      <thead>
        <tr>
          <th>Date</th>
          <th>Acteur</th>
          <th>Famille</th>
          <th>Donnée</th>
          <th>Statut</th>
        </tr>
      </thead>
      <tbody>
        {displayRows.map((row) => {
          if (row.kind === "import") {
            const expanded = Boolean(expandedKeys[row.key]);
            const canShowDetail = row.batch.failed > 0 && row.batch.topErrors.length > 0;
            const tone = getImportBatchStatusTone(row.batch);
            const statusLabel = getImportBatchStatusLabel(tone);
            const statusIcon = tone === "error" ? "!" : tone === "warn" ? "…" : "✓";
            const summary = `Total ${row.batch.total} · Succès ${row.batch.success} · Erreurs ${row.batch.failed}`;

            return (
              <tr key={row.key}>
                <td className="audit-cell-date">{new Date(row.occurredAt).toLocaleString("fr-FR")}</td>
                <td className="audit-cell-actor">{row.actorUsername}</td>
                <td className="audit-cell-family">
                  <span className="audit-family-cell">
                    <span className="audit-page-badge audit-page-badge--data">Référentiels</span>
                  </span>
                </td>
                <td className="audit-cell-data">
                  <div className="audit-action-cell">
                    <div className="audit-action-main audit-action-main--import">
                      <span className="audit-action-text">
                        Import en masse: {row.batch.fileName}
                        {canShowDetail ? (
                          <button
                            type="button"
                            className="audit-voir-detail-btn"
                            title={expanded ? "Masquer le détail des erreurs" : "Voir le détail des erreurs"}
                            aria-label={expanded ? "Masquer le détail des erreurs" : "Voir le détail des erreurs"}
                            aria-expanded={expanded}
                            onClick={() => toggleExpanded(row.key)}
                          >
                            {expanded ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                            <span>Voir détail</span>
                          </button>
                        ) : null}
                        <br />
                        <span className="muted audit-import-details">{summary}</span>
                      </span>
                    </div>
                    {expanded && canShowDetail ? (
                      <ul className="audit-import-error-list">
                        {row.batch.topErrors.map((entry, lineIdx) => (
                          <li key={`${row.key}-err-${lineIdx}`}>
                            <div>
                              Ligne {entry.rowIndex || "?"} : {entry.message}
                            </div>
                            {entry.rowSummary ? (
                              <div className="audit-import-error-row muted">
                                Contenu refusé : {entry.rowSummary}
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </td>
                <td className="audit-cell-status">
                  <span
                    className={`audit-status-check audit-status-check--${tone}`}
                    title={statusLabel}
                    aria-label={statusLabel}
                  >
                    {statusIcon}
                  </span>
                </td>
              </tr>
            );
          }

          const log = row.log;
          return (
            <tr key={row.key}>
              <td className="audit-cell-date">{new Date(log.occurredAt).toLocaleString("fr-FR")}</td>
              <td className="audit-cell-actor" title={buildActorTooltip(log)}>
                {log.actorUsername}
              </td>
              <td className="audit-cell-family">
                {(() => {
                  const label = formatAuditActionLabelOrUnknown(log.action);
                  const family = resolveAuditFamily(log.action, label);
                  const badgeTone = auditFamilyBadgeTone(family);
                  return (
                    <span className="audit-family-cell">
                      <span className={`audit-page-badge audit-page-badge--${badgeTone}`}>{family}</span>
                    </span>
                  );
                })()}
              </td>
              <td className="audit-cell-data" title={formatOldValuesTooltip(log)}>
                <span className="audit-action-text">{getAuditActionText(log)}</span>
              </td>
              <td className="audit-cell-status">
                {(() => {
                  const tone = getAuditStatusTone(log.status);
                  const icon = tone === "error" ? "!" : tone === "warn" ? "…" : "✓";
                  return (
                    <span
                      className={`audit-status-check audit-status-check--${tone}`}
                      title={formatAuditStatus(log.status)}
                      aria-label={formatAuditStatus(log.status)}
                    >
                      {icon}
                    </span>
                  );
                })()}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
