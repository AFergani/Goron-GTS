/**
 * Tableau des gardiennages (tri colonnes, badges type et statut).
 *
 * Colonne fusionnée « État / Actions » (boutons texte), alignée interventions / main courante.
 * Actions : Clôturer (règles métier horaires), Modifier / Voir le détail, Supprimer.
 * Colonne « Planning » : badge de type + période (liste) + horaires.
 * Vue journée : créneaux de nuit affichés avec la fin réelle (ex. 20:00 → 08:00) + icône lune.
 * Colonne Site : clic pour copier le code (comme les autres tableaux métier).
 */

import type { ReactNode } from "react";
import { Infinity, Moon } from "lucide-react";
import { SiteDisplayCopyButton } from "../../common/components/SiteDisplayCopyButton";
import { useTableSort } from "../../common/hooks/useTableSort";
import type { NotifyToast } from "../../common/model/toast.types";
import type { GardiennageEntry } from "../model/gardiennage.types";
import { canManuallyCloseGardiennage, gardiennageCloseBlockedLabel } from "../model/gardiennageClosure";
import { clipGardiennageHoursToDay, formatGardiennageDayHours } from "../model/gardiennageDayHours";
import { classifyGardiennageKind } from "../model/gardiennageKind";
import { statusLabelFr, statusTone } from "../export/gardiennageExportFormat";

function formatDateFr(iso: string): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Date de création au format français (jour uniquement, comme les rondes).
 *
 * @param iso - Horodatage ISO
 * @returns Date `jj/mm/aaaa`, ou tiret
 */
function formatCreatedAtDate(iso: string): string {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Infobulle datetime complète pour la date de création.
 *
 * @param iso - Horodatage ISO
 * @returns Date et heure `fr-FR`, ou chaîne vide
 */
function formatCreatedAtTitle(iso: string): string {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function isOpenEndedH24(entry: GardiennageEntry): boolean {
  const snap = entry.planningSnapshot;
  return Boolean(snap?.isOpenEnded && snap?.isContinuous);
}

function isTerminalStatus(status: GardiennageEntry["status"]): boolean {
  return status === "CLOTURE" || status === "ANNULE";
}

function OpenEndedInfinityMark() {
  const label = "Jusqu'à nouvel ordre";
  return (
    <span className="gardiennage-open-ended-icon" title={label} aria-label={label}>
      <Infinity size={15} strokeWidth={2.25} aria-hidden />
    </span>
  );
}

type GardiennageTableProps = {
  entries: GardiennageEntry[];
  /** Affiche les dates Du → Au dans la colonne Planning (onglet liste) */
  showPeriode?: boolean;
  /**
   * Date de la vue « journée » (`YYYY-MM-DD`) : horaires clippés sur ce jour.
   * Absent en affichage liste (horaires du créneau entier).
   */
  hoursForDate?: string;
  onEdit: (entry: GardiennageEntry) => void;
  onDelete: (entry: GardiennageEntry) => void;
  onClose?: (entry: GardiennageEntry) => void;
  onNotify?: NotifyToast;
};

/**
 * Horaires de la colonne : portion du jour en vue journée, sinon créneau stocké.
 *
 * @param entry - Ligne gardiennage
 * @param hoursForDate - Date vue journée, ou absente en liste
 * @returns Libellé React (texte, infini H24 ouvert, ou tiret) + indicateur nocturne éventuel
 */
function renderHoursCell(entry: GardiennageEntry, hoursForDate?: string) {
  if (hoursForDate) {
    const clipped = clipGardiennageHoursToDay(entry, hoursForDate);
    if (!clipped) {
      return { label: "—" as ReactNode, overnight: false, overnightTitle: "" };
    }
    const overnightTitle = clipped.overnight
      ? "Créneau nocturne (se termine le lendemain)"
      : "";
    return {
      label: formatGardiennageDayHours(clipped),
      overnight: clipped.overnight,
      overnightTitle
    };
  }
  if (!entry.startTime) {
    return { label: "—" as ReactNode, overnight: false, overnightTitle: "" };
  }
  if (isOpenEndedH24(entry)) {
    return {
      label: (
        <>
          {entry.startTime} → <OpenEndedInfinityMark />
        </>
      ),
      overnight: false,
      overnightTitle: ""
    };
  }
  return {
    label: entry.endTime ? `${entry.startTime} → ${entry.endTime}` : entry.startTime,
    overnight: Boolean(entry.crossesMidnight),
    overnightTitle: "Créneau nocturne (se termine le lendemain)"
  };
}

/**
 * Badge de type de prestation (H24, récurrent, ponctuel).
 *
 * @param entry - Ligne gardiennage
 */
function GardiennageKindBadge({ entry }: { entry: GardiennageEntry }) {
  const kind = classifyGardiennageKind(entry);
  return (
    <span
      className={`gardiennage-kind-badge gardiennage-kind-badge--${kind.id}`}
      title={kind.title}
    >
      {kind.label}
    </span>
  );
}

export function GardiennageTable({
  entries,
  showPeriode = false,
  hoursForDate,
  onEdit,
  onDelete,
  onClose,
  onNotify
}: GardiennageTableProps) {
  type GardiennageSortKey = "dailyCode" | "createdAt" | "site" | "planning" | "prestataire" | "statut";

  const comparators: Record<GardiennageSortKey, (a: GardiennageEntry, b: GardiennageEntry) => number> = {
    dailyCode: (a: GardiennageEntry, b: GardiennageEntry) => (a.dailyCode || "").localeCompare(b.dailyCode || "", "fr"),
    createdAt: (a: GardiennageEntry, b: GardiennageEntry) => (a.createdAt || "").localeCompare(b.createdAt || ""),
    site: (a: GardiennageEntry, b: GardiennageEntry) => (a.siteDisplay || "").localeCompare(b.siteDisplay || "", "fr"),
    planning: (a: GardiennageEntry, b: GardiennageEntry) => {
      const byPeriode = `${a.recurrenceStartDate || ""}|${a.recurrenceEndDate || ""}`.localeCompare(
        `${b.recurrenceStartDate || ""}|${b.recurrenceEndDate || ""}`
      );
      if (byPeriode !== 0) return byPeriode;
      return `${a.startTime || ""}|${a.endTime || ""}`.localeCompare(`${b.startTime || ""}|${b.endTime || ""}`);
    },
    prestataire: (a: GardiennageEntry, b: GardiennageEntry) => (a.intervenantName || "").localeCompare(b.intervenantName || "", "fr"),
    statut: (a: GardiennageEntry, b: GardiennageEntry) => statusLabelFr(a.status).localeCompare(statusLabelFr(b.status), "fr")
  };
  const { sortedEntries, sortDirection, sortKey, toggleSort } = useTableSort<GardiennageEntry, GardiennageSortKey>(entries, comparators, {
    key: "planning",
    direction: "asc"
  });
  const sortLabel = (key: GardiennageSortKey) => (sortKey === key ? (sortDirection === "asc" ? "↑" : "↓") : "↕");

  if (!entries.length) {
    return <p className="muted">Aucun gardiennage à afficher.</p>;
  }

  return (
    <div className="main-courante-table-wrap">
      <table className="main-courante-table gardiennage-table">
        <colgroup>
          <col className="col-daily-code" />
          <col className="gard-col-created" />
          <col className="gard-col-site" />
          <col className="gard-col-presta" />
          <col className="gard-col-planning" />
          <col className="gard-col-status-actions" />
        </colgroup>
        <thead>
          <tr>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("dailyCode")}>N° {sortLabel("dailyCode")}</button></th>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("createdAt")}>Créé le {sortLabel("createdAt")}</button></th>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("site")}>Site {sortLabel("site")}</button></th>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("prestataire")}>Prestataire {sortLabel("prestataire")}</button></th>
            <th>
              <button type="button" className="table-sort-btn" onClick={() => toggleSort("planning")}>
                {showPeriode ? "Période / Horaires" : "Horaires"} {sortLabel("planning")}
              </button>
            </th>
            <th className="gard-col-status-actions">
              <button type="button" className="table-sort-btn" onClick={() => toggleSort("statut")}>
                État / Actions {sortLabel("statut")}
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedEntries.map((entry) => {
            const terminal = isTerminalStatus(entry.status);
            const closeBlocked = gardiennageCloseBlockedLabel(entry);
            const canClose = Boolean(onClose) && canManuallyCloseGardiennage(entry);
            const showClose = Boolean(onClose) && !terminal;
            const hoursCell = renderHoursCell(entry, hoursForDate);
            return (
              <tr key={entry.id} className="mc-table-row">
                <td className="col-daily-code">{entry.dailyCode || "—"}</td>
                <td className="gardiennage-created-cell">
                  <span title={formatCreatedAtTitle(entry.createdAt) || undefined}>
                    {formatCreatedAtDate(entry.createdAt)}
                  </span>
                </td>
                <td className="mc-site-wrap">
                  <SiteDisplayCopyButton variant="table" siteLabel={entry.siteDisplay || ""} onNotify={onNotify} />
                </td>

                <td>{entry.intervenantName || <span className="muted">—</span>}</td>

                <td className="gardiennage-planning-cell">
                  <div className="gardiennage-planning-cell__inner">
                    <GardiennageKindBadge entry={entry} />
                    {showPeriode ? (
                      <span className="gardiennage-periode">
                        {formatDateFr(entry.recurrenceStartDate)}
                        {entry.isPonctuel ? null : entry.recurrenceEndDate ? (
                          <> → {formatDateFr(entry.recurrenceEndDate)}</>
                        ) : (
                          <> → <OpenEndedInfinityMark /></>
                        )}
                      </span>
                    ) : null}
                    <div className="gardiennage-creneau-cell">
                      <span className="gardiennage-creneau-label">{hoursCell.label}</span>
                      {hoursCell.overnight ? (
                        <span
                          className="gardiennage-nocturne-icon"
                          title={hoursCell.overnightTitle}
                          aria-label="Créneau nocturne"
                        >
                          <Moon size={13} aria-hidden />
                        </span>
                      ) : null}
                    </div>
                  </div>
                </td>

                <td className="gard-col-status-actions">
                  <div className="mc-status-actions-stack">
                    <span className={`mc-status-badge mc-status-badge--${statusTone(entry.status)}`}>
                      <span className="mc-status-badge__dot" aria-hidden />
                      <span className="mc-status-badge__label">{statusLabelFr(entry.status)}</span>
                    </span>
                    <div className="row-actions table-row-actions table-row-actions--text">
                      {showClose ? (
                        <button
                          type="button"
                          className="table-action-btn table-action-btn--text table-action-btn--validate"
                          title={canClose ? "Clôturer ce gardiennage" : closeBlocked}
                          aria-label={canClose ? "Clôturer" : closeBlocked}
                          disabled={!canClose}
                          onClick={() => {
                            if (!canClose) return;
                            onClose?.(entry);
                          }}
                        >
                          Clôturer
                        </button>
                      ) : null}
                      {!terminal ? (
                        <button
                          type="button"
                          className="table-action-btn table-action-btn--text"
                          title={
                            entry.planningBatchId
                              ? "Modifier toute la planification (lot)"
                              : "Modifier la planification"
                          }
                          onClick={() => onEdit(entry)}
                        >
                          Modifier
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="table-action-btn table-action-btn--text"
                          title="Consultation uniquement (créneau clôturé ou annulé)"
                          onClick={() => onEdit(entry)}
                        >
                          Voir le détail
                        </button>
                      )}
                      {!terminal ? (
                        <button
                          type="button"
                          className="table-action-btn table-action-btn--text table-action-btn--danger"
                          title="Supprimer"
                          onClick={() => onDelete(entry)}
                        >
                          Supprimer
                        </button>
                      ) : null}
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
