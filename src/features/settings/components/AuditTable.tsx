/**
 * Tableau journal d’actions (libellés référencés, détails avant/après, dates fr-FR).
 */

import type { AuditLog } from "../../../types";
import { formatAuditActionLabelOrUnknown } from "../model/auditActionLabels";

function resolveAuditFamily(action: string, label: string) {
  const bracketMatch = label.match(/^\[([^\]]+)\]\s*/);
  if (bracketMatch) {
    return bracketMatch[1];
  }
  if (action.startsWith("MAIN_COURANTE_")) return "Main courante";
  if (action.startsWith("INTERVENTION_")) return "Intervention";
  if (action.startsWith("RONDE_")) return "Rondes";
  if (action.startsWith("FRANSOR_")) return "Fransor";
  if (action.startsWith("DATA_")) return "Référentiels";
  if (action.startsWith("USER_") || action.startsWith("USERS_") || action.startsWith("AUTH_")) return "Utilisateurs";
  return "Système";
}

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

function formatAuditStatus(status: string) {
  const labels: Record<string, string> = {
    SUCCESS: "Succès",
    ERROR: "Erreur",
    WARNING: "Avertissement",
    WARN: "Avertissement",
    PENDING: "En attente"
  };
  return labels[status] || status;
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
            const snapshot = entry.snapshot ? JSON.stringify(entry.snapshot) : "{}";
            return `${index + 1}) ${when} par ${who}: ${snapshot}`;
          })
        ].join("\n")
      : "";

  if (log.action === "DATA_IMPORT_BATCH_ROW_ERROR") {
    const details = (log.details || {}) as {
      target?: unknown;
      rowIndex?: unknown;
      message?: unknown;
      row?: Record<string, unknown> | null;
    };
    const row = details.row || {};
    const siteCode = String(row["Code site"] || row.code || row.siteCode || "-");
    const siteName = String(row.Site || row.name || row.siteName || "-");
    return [
      "Détails erreur import",
      `Cible: ${String(details.target || "-")}`,
      `Ligne: ${String(details.rowIndex ?? "-")}`,
      `Message: ${String(details.message || "Erreur inconnue")}`,
      `Code site: ${siteCode}`,
      `Site: ${siteName}`
    ].join("\n");
  }
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
    if (log.action === "INTERVENTION_BILLING_UPDATE") {
      return [
        "Détails facturation intervention",
        `Avant: ${String(before.billingStatus || "-")}`,
        `Après: ${String(after.billingStatus || "-")}`,
        `Justification: ${String(after.billingReason || "-")}`
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
    if (log.action === "INTERVENTION_SITE_PENDING_RESOLVE" || log.action === "INTERVENTION_INTERVENANT_PENDING_RESOLVE") {
      const pending = (details.pendingSite || details.pendingIntervenant || {}) as Record<string, unknown>;
      const created = (details.createdSite || details.createdIntervenant || {}) as Record<string, unknown>;
      return [
        "Détails validation d'entrée en attente",
        `Mode: ${String(details.mode || "created")}`,
        `Entrée en attente: ${String(pending.code || pending.name || pending.id || "-")}`,
        `Entrée référentiel: ${String(created.code || created.name || details.resolvedSiteId || details.resolvedIntervenantId || "-")}`
      ].join("\n");
    }
    if (log.action === "INTERVENTION_SITE_PENDING_DELETE" || log.action === "INTERVENTION_INTERVENANT_PENDING_DELETE") {
      const deleted = (details.deleted || details.pendingSite || details.pendingIntervenant || {}) as Record<string, unknown>;
      return [
        "Détails suppression d'entrée en attente",
        `Entrée: ${String(deleted.code || deleted.name || deleted.id || "-")}`,
        `Motif: ${String(details.reason || "-")}`
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
      return [
        "Détails exception",
        `Du: ${String(period?.startDate || "-")}`,
        `Au: ${String(period?.endDate || "-")}`,
        `Type: ${toModeLabel(details.mode || after?.mode)}`,
        `Motif: ${String(details.label || after?.label || "-")}`,
        `Motif suppression: ${String(details.reason || "-")}`
      ].join("\n");
    }
    if (log.action === "FRANSOR_ENTRY_CREATE" || log.action === "FRANSOR_ENTRY_UPDATE") {
      const next = after || details;
      return [
        "Détails saisie",
        `Date: ${String(details.date || "-")}`,
        `Responsable: ${toDisplayResponsable(details.responsableName, details.responsableId)}`,
        `Ouverture: ${toYesNo(next.ouvertureDone ?? details.ouvertureDone)}`,
        `Fermeture: ${toYesNo(next.fermetureDone ?? details.fermetureDone)}`
      ].join("\n");
    }
    return undefined;
  }
  if (log.action.endsWith("_CREATE")) {
    const created = detailsAny.created || detailsAny;
    return ["Données créées", JSON.stringify(created || {})].join("\n");
  }
  if (log.action.endsWith("_DELETE")) {
    const deleted = detailsAny.deleted || {};
    const reason = String(detailsAny.reason || "-");
    return ["Données supprimées", JSON.stringify(deleted), `Motif: ${reason}`].join("\n");
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
  return (
    <table>
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
        {logs.map((log, idx) => (
          <tr key={`${log.occurredAt}-${idx}`}>
            <td>{new Date(log.occurredAt).toLocaleString("fr-FR")}</td>
            <td title={buildActorTooltip(log)}>{log.actorUsername}</td>
            <td>
              {(() => {
                const label = formatAuditActionLabelOrUnknown(log.action);
                const family = resolveAuditFamily(log.action, label);
                const tone = auditFamilyBadgeTone(family);
                return (
                  <span className="audit-family-cell">
                    <span className={`audit-page-badge audit-page-badge--${tone}`}>{family}</span>
                  </span>
                );
              })()}
            </td>
            <td title={formatOldValuesTooltip(log)}>
              {(() => {
                const label = formatAuditActionLabelOrUnknown(log.action);
                return <span className="audit-action-text">{stripAuditFamilyPrefix(label)}</span>;
              })()}
            </td>
            <td>
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
        ))}
      </tbody>
    </table>
  );
}
