/**
 * Tableau des fiches ronde : tri, copie code site, colonne État / Actions (boutons texte).
 *
 * Utilisé en liste contractuelle et exceptionnelle.
 */

import { SiteDisplayCopyButton } from "../../common/components/SiteDisplayCopyButton";
import { useTableSort } from "../../common/hooks/useTableSort";
import { formatDateShortFr } from "../../common/utils/formatDateShortFr";
import type { RondeEntry } from "../model/ronde.types";
import type { NotifyToast } from "../../common/model/toast.types";
import { formatPlannedRoundKindLabel } from "../model/plannedSlots";
import type { RondePlannedRoundKind } from "../model/rondePlanned.types";

function statusLabel(entry: RondeEntry) {
  if (entry.status === "CLOTURE") return "Clôturé";
  if (entry.status === "ANNULE") {
    return entry.cancellationKind === "NON_EFFECTUEE" ? "Non effectuée" : "Annulé";
  }
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
  return formatDateShortFr(dateIso) || "—";
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
  | "status";

type RondeTableProps = {
  entries: RondeEntry[];
  onOpen: (entry: RondeEntry) => void;
  onFollowUp: (entry: RondeEntry) => void;
  onExportWord?: (entry: RondeEntry) => void;
  /** Ouvre la programmation liée (rondes contractuelles). */
  onOpenProfile?: (profileId: string) => void;
  /** Ouvre la demande liée (rondes exceptionnelles). */
  onOpenLinkedDemand?: (entry: RondeEntry) => void;
  /** Colonne Origine (masquée en contractuel : toujours télésurveillance). */
  showOrigin?: boolean;
  onNotify?: NotifyToast;
};

export function RondeTable({
  entries,
  onOpen,
  onFollowUp,
  onExportWord,
  onOpenProfile,
  onOpenLinkedDemand,
  showOrigin = true,
  onNotify
}: RondeTableProps) {
  const comparators: Record<RondeSortKey, (a: RondeEntry, b: RondeEntry) => number> = {
    requestDate: (a: RondeEntry, b: RondeEntry) => a.requestDate.localeCompare(b.requestDate),
    siteDisplay: (a: RondeEntry, b: RondeEntry) => (a.siteDisplay || "").localeCompare(b.siteDisplay || "", "fr"),
    origin: (a: RondeEntry, b: RondeEntry) => originSummary(a).localeCompare(originSummary(b), "fr"),
    intervenant: (a: RondeEntry, b: RondeEntry) => (a.intervenantName || "").localeCompare(b.intervenantName || "", "fr"),
    status: (a: RondeEntry, b: RondeEntry) => statusLabel(a).localeCompare(statusLabel(b), "fr")
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
      <table className={`main-courante-table ronde-table${showOrigin ? "" : " ronde-table--no-origin"}`}>
        <colgroup>
          <col className="ronde-col-date" />
          <col className="ronde-col-site" />
          {showOrigin ? <col className="ronde-col-origin" /> : null}
          <col className="ronde-col-presta" />
          <col className="ronde-col-time" />
          <col className="ronde-col-time" />
          <col className="ronde-col-duree" />
          <col className="ronde-col-bon" />
          <col className="ronde-col-status-actions" />
        </colgroup>
        <thead>
          <tr>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("requestDate")}>Date demande {sortLabel("requestDate")}</button></th>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("siteDisplay")}>Site {sortLabel("siteDisplay")}</button></th>
            {showOrigin ? (
              <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("origin")}>Origine {sortLabel("origin")}</button></th>
            ) : null}
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("intervenant")}>Prestataire {sortLabel("intervenant")}</button></th>
            <th>H arrivée</th>
            <th>H départ</th>
            <th>Durée</th>
            <th>N° bon</th>
            <th className="ronde-col-status-actions">
              <button type="button" className="table-sort-btn" onClick={() => toggleSort("status")}>
                État / Actions {sortLabel("status")}
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedEntries.map((entry) => (
            <tr key={entry.id}>
              <td className="ronde-request-date-cell">
                <div className="ronde-request-date-cell__inner">
                  {entry.plannedRoundKind ? (
                    <span
                      className={`ronde-kind-badge ronde-kind-badge--${plannedKindTone(entry.plannedRoundKind as RondePlannedRoundKind)}`}
                      title={`Type planifié : ${formatPlannedRoundKindLabel(entry.plannedRoundKind as RondePlannedRoundKind)}`}
                    >
                      {formatPlannedRoundKindLabel(entry.plannedRoundKind as RondePlannedRoundKind)}
                    </span>
                  ) : null}
                  <span>{formatRequestDate(entry.requestDate)}</span>
                </div>
              </td>
              <td className="mc-site-wrap">
                <SiteDisplayCopyButton variant="table" siteLabel={entry.siteDisplay || ""} onNotify={onNotify} />
              </td>
              {showOrigin ? (
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
              ) : null}
              <td>{entry.intervenantName || "—"}</td>
              <td>{entry.arrivalTime || "—"}</td>
              <td>{entry.departureTime || "—"}</td>
              <td>{entry.durationMinutes == null ? "—" : `${entry.durationMinutes} min`}</td>
              <td>{entry.workOrderNumber || "—"}</td>
              <td className="ronde-col-status-actions">
                <div className="mc-status-actions-stack">
                  <span className={`mc-status-badge mc-status-badge--${statusTone(entry.status)}`}>
                    <span className="mc-status-badge__dot" aria-hidden />
                    <span className="mc-status-badge__label">{statusLabel(entry)}</span>
                  </span>
                  {entry.batchDeleteRequestedAt ? (
                    <span className="muted" style={{ fontSize: "0.8em" }} title={entry.batchDeleteReason || undefined}>
                      Suppression demandée
                    </span>
                  ) : null}
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
                        Voir le détail
                      </button>
                    ) : null}
                    {onOpenProfile && entry.plannedProfileId ? (
                      <button
                        type="button"
                        className="table-action-btn table-action-btn--text"
                        onClick={() => onOpenProfile(entry.plannedProfileId!)}
                      >
                        Voir programmation
                      </button>
                    ) : null}
                    {onOpenLinkedDemand &&
                    (entry.source === "URGENCE" || entry.source === "LIEE_INTERVENTION") ? (
                      <button
                        type="button"
                        className="table-action-btn table-action-btn--text"
                        onClick={() => onOpenLinkedDemand(entry)}
                      >
                        Demande liée
                      </button>
                    ) : null}
                    {onExportWord && (entry.status === "CLOTURE" || entry.status === "ANNULE") ? (
                      <button
                        type="button"
                        className="table-action-btn table-action-btn--text table-action-btn--word"
                        onClick={() => onExportWord(entry)}
                      >
                        Export Word
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
