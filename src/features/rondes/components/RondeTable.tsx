/**
 * Tableau des fiches ronde (tri, statuts, actions icônes).
 */

import { Check, Eye, FileText } from "lucide-react";
import { SiteDisplayCopyButton } from "../../common/components/SiteDisplayCopyButton";
import { useTableSort } from "../../common/hooks/useTableSort";
import type { RondeEntry } from "../model/ronde.types";
import type { NotifyToast } from "../../common/model/toast.types";
import { formatPlannedRoundKindLabel } from "../model/plannedSlots";
import type { RondePlannedRoundKind } from "../model/rondePlanned.types";

function statusLabel(status: RondeEntry["status"]) {
  if (status === "CLOTURE") return "Clôturé";
  if (status === "ANNULE") return "Annulé";
  return "En cours";
}

function statusTone(status: RondeEntry["status"]) {
  if (status === "CLOTURE") return "cloture";
  if (status === "ANNULE") return "en-attente";
  return "en-cours";
}

function originSummary(entry: RondeEntry) {
  if (entry.originKind === "TELESURVEILLANCE") return "Télésurveillance";
  if (entry.originKind === "CLIENT") {
    return entry.originDetail.trim() ? `Client — ${entry.originDetail.trim()}` : "Client";
  }
  return entry.originDetail.trim() ? `Autre — ${entry.originDetail.trim()}` : "Autre";
}

function plannedKindTone(kind: RondePlannedRoundKind): "opening" | "closing" | "random" {
  if (kind === "OPENING") return "opening";
  if (kind === "CLOSING") return "closing";
  if (kind === "ACCOMPAGNEMENT") return "opening";
  return "random";
}

function formatRequestDate(dateIso: string) {
  if (!dateIso) return "—";
  const parsed = Date.parse(`${dateIso}T12:00:00`);
  if (Number.isNaN(parsed)) return "—";
  return new Date(parsed).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function normalizeOriginDetail(entry: RondeEntry): string {
  const raw = (entry.originDetail || "").trim();
  if (!raw) return "—";
  const normalized = raw.toLowerCase();
  if (normalized === "planifiée" || normalized === "planifiee") {
    return "—";
  }
  return raw;
}

type RondeSortKey =
  | "requestDate"
  | "siteDisplay"
  | "origin"
  | "intervenant"
  | "arrival"
  | "departure"
  | "duration"
  | "status";

type RondeTableProps = {
  entries: RondeEntry[];
  onOpen: (entry: RondeEntry) => void;
  onFollowUp: (entry: RondeEntry) => void;
  onExportWord?: (entry: RondeEntry) => void;
  onNotify?: NotifyToast;
};

export function RondeTable({ entries, onOpen, onFollowUp, onExportWord, onNotify }: RondeTableProps) {
  const comparators: Record<RondeSortKey, (a: RondeEntry, b: RondeEntry) => number> = {
    requestDate: (a: RondeEntry, b: RondeEntry) => a.requestDate.localeCompare(b.requestDate),
    siteDisplay: (a: RondeEntry, b: RondeEntry) => (a.siteDisplay || "").localeCompare(b.siteDisplay || "", "fr"),
    origin: (a: RondeEntry, b: RondeEntry) => originSummary(a).localeCompare(originSummary(b), "fr"),
    intervenant: (a: RondeEntry, b: RondeEntry) => (a.intervenantName || "").localeCompare(b.intervenantName || "", "fr"),
    arrival: (a: RondeEntry, b: RondeEntry) => (a.arrivalTime || "").localeCompare(b.arrivalTime || ""),
    departure: (a: RondeEntry, b: RondeEntry) => (a.departureTime || "").localeCompare(b.departureTime || ""),
    duration: (a: RondeEntry, b: RondeEntry) => (a.durationMinutes || 0) - (b.durationMinutes || 0),
    status: (a: RondeEntry, b: RondeEntry) => statusLabel(a.status).localeCompare(statusLabel(b.status), "fr")
  };

  const { sortedEntries, sortDirection, sortKey, toggleSort } = useTableSort<RondeEntry, RondeSortKey>(entries, comparators, {
    key: "requestDate",
    direction: "desc"
  });

  const sortLabel = (key: RondeSortKey) => (sortKey === key ? (sortDirection === "asc" ? "↑" : "↓") : "↕");

  if (!entries.length) {
    return <p className="muted">Aucune ronde.</p>;
  }

  return (
    <div className="main-courante-table-wrap">
      <table className="main-courante-table ronde-table">
        <colgroup>
          <col className="ronde-col-date" />
          <col className="ronde-col-site" />
          <col className="ronde-col-origin" />
          <col className="ronde-col-presta" />
          <col className="ronde-col-time" />
          <col className="ronde-col-time" />
          <col className="ronde-col-duree" />
          <col className="ronde-col-bon" />
          <col className="ronde-col-etat" />
          <col className="ronde-col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("requestDate")}>Date demande {sortLabel("requestDate")}</button></th>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("siteDisplay")}>Site {sortLabel("siteDisplay")}</button></th>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("origin")}>Origine {sortLabel("origin")}</button></th>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("intervenant")}>Prestataire {sortLabel("intervenant")}</button></th>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("arrival")}>H arrivée {sortLabel("arrival")}</button></th>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("departure")}>H départ {sortLabel("departure")}</button></th>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("duration")}>Durée {sortLabel("duration")}</button></th>
            <th>N° bon</th>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("status")}>État {sortLabel("status")}</button></th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedEntries.map((entry) => (
            <tr key={entry.id}>
              <td className="ronde-request-date-cell">
                {entry.plannedRoundKind ? (
                  <span
                    className={`ronde-kind-badge ronde-kind-badge--${plannedKindTone(entry.plannedRoundKind as RondePlannedRoundKind)}`}
                    title={`Type planifié : ${formatPlannedRoundKindLabel(entry.plannedRoundKind as RondePlannedRoundKind)}`}
                  >
                    {formatPlannedRoundKindLabel(entry.plannedRoundKind as RondePlannedRoundKind)}
                  </span>
                ) : null}
                <span>{formatRequestDate(entry.requestDate)}</span>
              </td>
              <td className="mc-site-wrap">
                <SiteDisplayCopyButton variant="table" siteLabel={entry.siteDisplay || ""} onNotify={onNotify} />
              </td>
              <td>
                <div className="ronde-origin-cell">
                  <span className="ronde-origin-badge">{entry.originKind === "TELESURVEILLANCE" ? "Télésurveillance" : entry.originKind === "CLIENT" ? "Client" : "Autre"}</span>
                  <span className="ronde-origin-detail">
                    {entry.originKind === "TELESURVEILLANCE"
                      ? normalizeOriginDetail(entry)
                      : entry.originDetail?.trim() || (entry.originKind === "CLIENT" ? "Sans précision" : "Sans précision")}
                    {entry.source === "LIEE_INTERVENTION" ? " · liée int." : ""}
                  </span>
                </div>
              </td>
              <td>{entry.intervenantName || "—"}</td>
              <td>{entry.arrivalTime || "—"}</td>
              <td>{entry.departureTime || "—"}</td>
              <td>{entry.durationMinutes == null ? "—" : `${entry.durationMinutes} min`}</td>
              <td>{entry.workOrderNumber || "—"}</td>
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
                      title="Compléter / clôturer"
                      aria-label="Compléter / clôturer"
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
                  {onExportWord && (entry.status === "CLOTURE" || entry.status === "ANNULE") ? (
                    <button
                      type="button"
                      className="mc-table-action-btn mc-table-action-btn--word"
                      title="Exporter Word"
                      aria-label="Exporter la fiche Word"
                      onClick={() => onExportWord(entry)}
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
