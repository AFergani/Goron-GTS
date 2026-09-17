/**
 * Tableau interventions : tri, copie code site, colonne État / Actions (boutons texte).
 *
 * Badges statut et dates au format français.
 */

import { SiteDisplayCopyButton } from "../../common/components/SiteDisplayCopyButton";
import { useTableSort } from "../../common/hooks/useTableSort";
import {
  INTERVENTION_NO_WORK_ORDER_LABEL,
  type InterventionEntry
} from "../model/intervention.types";
import {
  formatInterventionDateTime,
  statusLabelFr,
  statusTone
} from "../export/interventionExportFormat";
import type { NotifyToast } from "../../common/model/toast.types";

type InterventionTableProps = {
  entries: InterventionEntry[];
  onOpen: (entry: InterventionEntry) => void;
  onFollowUp: (entry: InterventionEntry) => void;
  onNotify?: NotifyToast;
};

export function InterventionTable({ entries, onOpen, onFollowUp, onNotify }: InterventionTableProps) {
  type InterventionSortKey = "dailyCode" | "date" | "site" | "prestataire" | "etat";

  const requestDateTimeMs = (entry: InterventionEntry) => {
    const date = String(entry.requestDate || "").trim();
    const time = String(entry.requestTime || "00:00").trim() || "00:00";
    if (!date) return 0;
    const ms = Date.parse(`${date}T${time}:00`);
    return Number.isFinite(ms) ? ms : 0;
  };

  const comparators: Record<InterventionSortKey, (a: InterventionEntry, b: InterventionEntry) => number> = {
    dailyCode: (a, b) => (a.dailyCode || "").localeCompare(b.dailyCode || "", "fr"),
    date: (a, b) => requestDateTimeMs(a) - requestDateTimeMs(b),
    site: (a, b) => (a.siteDisplay || "").localeCompare(b.siteDisplay || "", "fr"),
    prestataire: (a, b) => (a.intervenantName || "").localeCompare(b.intervenantName || "", "fr"),
    etat: (a, b) => statusLabelFr(a.status).localeCompare(statusLabelFr(b.status), "fr")
  };
  const { sortedEntries, sortDirection, sortKey, toggleSort } = useTableSort<InterventionEntry, InterventionSortKey>(entries, comparators, {
    key: "date",
    direction: "desc"
  });
  const sortLabel = (key: InterventionSortKey) => (sortKey === key ? (sortDirection === "asc" ? "↑" : "↓") : "↕");

  if (!entries.length) {
    return <p className="muted">Aucune intervention.</p>;
  }

  return (
    <div className="main-courante-table-wrap">
      <table className="main-courante-table intervention-table">
        <colgroup>
          <col className="col-daily-code" />
          <col className="intv-col-date" />
          <col className="intv-col-site" />
          <col className="intv-col-presta" />
          <col className="intv-col-motif" />
          <col className="intv-col-time" />
          <col className="intv-col-time" />
          <col className="intv-col-duree" />
          <col className="intv-col-bon" />
          <col className="intv-col-status-actions" />
        </colgroup>
        <thead>
          <tr>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("dailyCode")}>N° {sortLabel("dailyCode")}</button></th>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("date")}>Date / Demande {sortLabel("date")}</button></th>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("site")}>Clients (Code site) {sortLabel("site")}</button></th>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("prestataire")}>Prestataire {sortLabel("prestataire")}</button></th>
            <th>Motif</th>
            <th>H arrivée</th>
            <th>H départ</th>
            <th>Délai</th>
            <th>N° bon</th>
            <th className="intv-col-status-actions">
              <button type="button" className="table-sort-btn" onClick={() => toggleSort("etat")}>
                État / Actions {sortLabel("etat")}
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedEntries.map((entry) => (
            <tr key={entry.id}>
              <td className="col-daily-code">{entry.dailyCode || "—"}</td>
              <td>{formatInterventionDateTime(entry.requestDate, entry.requestTime)}</td>
              <td className="mc-site-wrap">
                <SiteDisplayCopyButton variant="table" siteLabel={entry.siteDisplay || ""} onNotify={onNotify} />
              </td>
              <td>{entry.intervenantName || "—"}</td>
              <td className="intervention-motif-cell">{entry.requestReason}</td>
              <td>{entry.arrivalTime || "—"}</td>
              <td>{entry.departureTime || "—"}</td>
              <td>{entry.delayMinutes == null ? "—" : `${entry.delayMinutes} min`}</td>
              <td>{entry.workOrderNumber || INTERVENTION_NO_WORK_ORDER_LABEL}</td>
              <td className="intv-col-status-actions">
                <div className="mc-status-actions-stack">
                  <span className={`mc-status-badge mc-status-badge--${statusTone(entry.status)}`}>
                    <span className="mc-status-badge__dot" aria-hidden />
                    <span className="mc-status-badge__label">{statusLabelFr(entry.status)}</span>
                  </span>
                  <div className="row-actions table-row-actions table-row-actions--text">
                    {entry.status === "EN_COURS" ? (
                      <button
                        type="button"
                        className="table-action-btn table-action-btn--text table-action-btn--validate"
                        onClick={() => onFollowUp(entry)}
                      >
                        Clôturer
                      </button>
                    ) : null}
                    {entry.status === "CLOTURE" || entry.status === "ANNULE" ? (
                      <button
                        type="button"
                        className="table-action-btn table-action-btn--text"
                        onClick={() => onOpen(entry)}
                      >
                        Ouvrir la fiche
                      </button>
                    ) : null}
                  </div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
