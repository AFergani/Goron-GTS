/**
 * Tableau des logs techniques locaux (`gts-pg-events.log`) — même présentation que le journal d’actions.
 */

import type { TechErrorLog } from "../../../infrastructure/api/gtsApiClient";
import { formatDateTimeFr } from "../../common/utils/formatDateShortFr";
import {
  formatTechDetailsText,
  formatTechEventText,
  formatTechStatusLabel,
  getTechStatusTone,
  resolveTechFamily,
  techFamilyBadgeTone
} from "../model/techErrorLogsDisplay";

/**
 * @param props.logs - Entrées déjà triées (plus récentes d'abord).
 */
export function TechErrorLogsTable({ logs }: { logs: TechErrorLog[] }) {
  if (!logs.length) {
    return <p className="muted">Aucun log technique pour le moment.</p>;
  }

  return (
    <table className="audit-logs-table audit-logs-table--tech">
      <colgroup>
        <col className="audit-col-date" />
        <col className="audit-col-family" />
        <col className="audit-col-data" />
        <col className="audit-col-status" />
      </colgroup>
      <thead>
        <tr>
          <th>Date</th>
          <th>Famille</th>
          <th>Événement</th>
          <th>Statut</th>
        </tr>
      </thead>
      <tbody>
        {logs.map((log, index) => {
          const family = resolveTechFamily(log.code, log.source);
          const tone = techFamilyBadgeTone(family);
          const statusTone = getTechStatusTone(log.code);
          const statusLabel = formatTechStatusLabel(statusTone);
          const statusIcon = statusTone === "error" ? "!" : statusTone === "warn" ? "…" : "✓";
          const detailTip = formatTechDetailsText(log.details);
          const eventText = formatTechEventText(log);

          return (
            <tr key={`${log.occurredAt}-${log.code}-${index}`}>
              <td className="audit-cell-date">{formatDateTimeFr(log.occurredAt) || "—"}</td>
              <td className="audit-cell-family">
                <span className="audit-family-cell">
                  <span className={`audit-page-badge audit-page-badge--${tone}`}>{family}</span>
                </span>
              </td>
              <td className="audit-cell-data" title={detailTip || eventText}>
                <span className="audit-action-text">{eventText}</span>
              </td>
              <td className="audit-cell-status">
                <span
                  className={`audit-status-check audit-status-check--${statusTone}`}
                  title={statusLabel}
                  aria-label={statusLabel}
                >
                  {statusIcon}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
