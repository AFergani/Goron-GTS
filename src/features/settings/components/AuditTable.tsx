/**
 * Tableau journal d’actions (libellés référencés, détails avant/après, dates fr-FR).
 *
 * La logique d’affichage (fusion import, tooltips, tons) vit dans `auditTableDisplay.ts`.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AuditLog } from "../../../types";
import {
  formatAuditActionLabelOrUnknown,
  formatAuditStatus,
  resolveAuditFamily
} from "../model/auditActionLabels";
import {
  auditFamilyBadgeTone,
  buildActorTooltip,
  buildAuditDisplayRows,
  getAuditActionText,
  getAuditStatusTone,
  getImportBatchStatusLabel,
  getImportBatchStatusTone
} from "../model/auditTableDisplay";
import { formatOldValuesTooltip } from "../model/auditOldValuesTooltip";

/**
 * @param props.logs - Entrées d’audit à afficher
 */
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
