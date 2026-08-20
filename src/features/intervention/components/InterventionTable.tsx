/**
 * Tableau interventions : tri, copie code site, actions ouvrir / suivi / export Word.
 *
 * Badges statut et file d’attente DB. Dates au format français.
 */

import { Check, Eye, FileText } from "lucide-react";
import { SiteDisplayCopyButton } from "../../common/components/SiteDisplayCopyButton";
import { useTableSort } from "../../common/hooks/useTableSort";
import {
  INTERVENTION_NO_WORK_ORDER_LABEL,
  type InterventionEntry
} from "../model/intervention.types";
import type { NotifyToast } from "../../common/model/toast.types";

function statusLabel(status: InterventionEntry["status"]) {
  if (status === "CLOTURE") return "Clôturé";
  if (status === "ANNULE") return "Annulé";
  return "En cours";
}

function statusTone(status: InterventionEntry["status"]) {
  if (status === "CLOTURE") return "cloture";
  if (status === "ANNULE") return "en-attente";
  return "en-cours";
}

function formatDateTime(date: string, time: string) {
  if (!date) return "—";
  const iso = `${date}T${time || "00:00"}:00`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

type InterventionTableProps = {
  entries: InterventionEntry[];
  onOpen: (entry: InterventionEntry) => void;
  onFollowUp: (entry: InterventionEntry) => void;
  onPrint: (entry: InterventionEntry) => void;
  onNotify?: NotifyToast;
};

export function InterventionTable({ entries, onOpen, onFollowUp, onPrint, onNotify }: InterventionTableProps) {
  if (!entries.length) {
    return <p className="muted">Aucune intervention.</p>;
  }

  type InterventionSortKey = "date" | "site" | "motif" | "prestataire" | "arrivee" | "depart" | "delai" | "etat";

  const comparators: Record<InterventionSortKey, (a: InterventionEntry, b: InterventionEntry) => number> = {
    date: (a: InterventionEntry, b: InterventionEntry) => `${a.requestDate} ${a.requestTime}`.localeCompare(`${b.requestDate} ${b.requestTime}`),
    site: (a: InterventionEntry, b: InterventionEntry) => (a.siteDisplay || "").localeCompare(b.siteDisplay || "", "fr"),
    motif: (a: InterventionEntry, b: InterventionEntry) => (a.requestReason || "").localeCompare(b.requestReason || "", "fr"),
    prestataire: (a: InterventionEntry, b: InterventionEntry) => (a.intervenantName || "").localeCompare(b.intervenantName || "", "fr"),
    arrivee: (a: InterventionEntry, b: InterventionEntry) => (a.arrivalTime || "").localeCompare(b.arrivalTime || ""),
    depart: (a: InterventionEntry, b: InterventionEntry) => (a.departureTime || "").localeCompare(b.departureTime || ""),
    delai: (a: InterventionEntry, b: InterventionEntry) => (a.delayMinutes || 0) - (b.delayMinutes || 0),
    etat: (a: InterventionEntry, b: InterventionEntry) => statusLabel(a.status).localeCompare(statusLabel(b.status), "fr")
  };
  const { sortedEntries, sortDirection, sortKey, toggleSort } = useTableSort<InterventionEntry, InterventionSortKey>(entries, comparators, {
    key: "date",
    direction: "desc"
  });
  const sortLabel = (key: InterventionSortKey) => (sortKey === key ? (sortDirection === "asc" ? "↑" : "↓") : "↕");

  return (
    <div className="main-courante-table-wrap">
      <table className="main-courante-table intervention-table">
        <colgroup>
          <col className="intv-col-date" />
          <col className="intv-col-site" />
          <col className="intv-col-motif" />
          <col className="intv-col-presta" />
          <col className="intv-col-time" />
          <col className="intv-col-time" />
          <col className="intv-col-duree" />
          <col className="intv-col-bon" />
          <col className="intv-col-etat" />
          <col className="intv-col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("date")}>Date / Demande {sortLabel("date")}</button></th>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("site")}>Clients (Code site) {sortLabel("site")}</button></th>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("motif")}>Motif {sortLabel("motif")}</button></th>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("prestataire")}>Prestataire {sortLabel("prestataire")}</button></th>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("arrivee")}>H arrivée {sortLabel("arrivee")}</button></th>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("depart")}>H départ {sortLabel("depart")}</button></th>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("delai")}>Délai {sortLabel("delai")}</button></th>
            <th>N° bon</th>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("etat")}>État {sortLabel("etat")}</button></th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedEntries.map((entry) => (
            <tr key={entry.id}>
              <td>{formatDateTime(entry.requestDate, entry.requestTime)}</td>
              <td className="mc-site-wrap">
                <SiteDisplayCopyButton variant="table" siteLabel={entry.siteDisplay || ""} onNotify={onNotify} />
              </td>
              <td className="intervention-motif-cell">{entry.requestReason}</td>
              <td>{entry.intervenantName || "—"}</td>
              <td>{entry.arrivalTime || "—"}</td>
              <td>{entry.departureTime || "—"}</td>
              <td>{entry.delayMinutes == null ? "—" : `${entry.delayMinutes} min`}</td>
              <td>{entry.workOrderNumber || INTERVENTION_NO_WORK_ORDER_LABEL}</td>
              <td>
                <span className={`mc-status-badge mc-status-badge--${statusTone(entry.status)}`}>
                  <span className="mc-status-badge__dot" aria-hidden />
                  <span className="mc-status-badge__label">{statusLabel(entry.status)}</span>
                </span>
              </td>
              <td>
                <div className="row-actions mc-row-actions-wrap">
                  {entry.status === "EN_COURS" ? (
                    <button
                      type="button"
                      className="mc-table-action-btn mc-table-action-btn--validate"
                      title="À suivre / Clôturer"
                      aria-label="À suivre / Clôturer"
                      onClick={() => onFollowUp(entry)}
                    >
                      <Check size={16} />
                    </button>
                  ) : null}
                  {entry.status === "CLOTURE" || entry.status === "ANNULE" ? (
                    <button type="button" className="mc-table-action-btn" title="Ouvrir" aria-label="Ouvrir" onClick={() => onOpen(entry)}>
                      <Eye size={16} />
                    </button>
                  ) : null}
                  {entry.status === "CLOTURE" || entry.status === "ANNULE" ? (
                    <button
                      type="button"
                      className="mc-table-action-btn mc-table-action-btn--word"
                      title="Exporter en Word"
                      aria-label="Exporter en Word"
                      onClick={() => onPrint(entry)}
                    >
                      <FileText size={16} />
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
