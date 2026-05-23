/**
 * Tableau des gardiennages (tri colonnes, badges statut, file d’attente DB).
 *
 * Actions : clôturer (si actif/planifié), modifier, export Word (clôturé/annulé), supprimer.
 * Colonne Période optionnelle (onglet Planification).
 */

import { Check, FileText, Infinity, Moon, Pencil, Trash2 } from "lucide-react";
import { useTableSort } from "../../common/hooks/useTableSort";
import type { GardiennageEntry } from "../model/gardiennage.types";

function statusLabel(status: GardiennageEntry["status"]) {
  if (status === "ACTIF") return "Actif";
  if (status === "CLOTURE") return "Clôturé";
  if (status === "ANNULE") return "Annulé";
  return "En cours"; /* PLANIFIE */
}

function statusTone(status: GardiennageEntry["status"]) {
  if (status === "ACTIF") return "en-cours";
  if (status === "CLOTURE") return "cloture";
  if (status === "ANNULE") return "annule";
  return "info"; /* PLANIFIE → bleu neutre */
}

function formatDateFr(iso: string): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function isOpenEndedH24(entry: GardiennageEntry): boolean {
  const snap = entry.planningSnapshot;
  return Boolean(snap?.isOpenEnded && snap?.isContinuous);
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
  /** Affiche la colonne Période (Du → Au) — pour l'onglet Planification */
  showPeriode?: boolean;
  onEdit: (entry: GardiennageEntry) => void;
  onDelete: (entry: GardiennageEntry) => void;
  onClose?: (entry: GardiennageEntry) => void;
  /** Export Word de la fiche */
  onExportWord?: (entry: GardiennageEntry) => void;
};

export function GardiennageTable({
  entries,
  showPeriode = false,
  onEdit,
  onDelete,
  onClose,
  onExportWord
}: GardiennageTableProps) {
  if (!entries.length) {
    return <p className="muted">Aucun gardiennage à afficher.</p>;
  }

  const comparators = {
    site: (a: GardiennageEntry, b: GardiennageEntry) => (a.siteDisplay || "").localeCompare(b.siteDisplay || "", "fr"),
    periode: (a: GardiennageEntry, b: GardiennageEntry) =>
      `${a.recurrenceStartDate || ""}|${a.recurrenceEndDate || ""}`.localeCompare(`${b.recurrenceStartDate || ""}|${b.recurrenceEndDate || ""}`),
    horaires: (a: GardiennageEntry, b: GardiennageEntry) => `${a.startTime || ""}|${a.endTime || ""}`.localeCompare(`${b.startTime || ""}|${b.endTime || ""}`),
    prestataire: (a: GardiennageEntry, b: GardiennageEntry) => (a.intervenantName || "").localeCompare(b.intervenantName || "", "fr"),
    statut: (a: GardiennageEntry, b: GardiennageEntry) => statusLabel(a.status).localeCompare(statusLabel(b.status), "fr")
  } as const;
  const { sortedEntries, sortDirection, sortKey, toggleSort } = useTableSort(entries, comparators, {
    key: showPeriode ? "periode" : "site",
    direction: "desc"
  });
  const sortLabel = (key: keyof typeof comparators) => (sortKey === key ? (sortDirection === "asc" ? "↑" : "↓") : "↕");

  return (
    <div className="main-courante-table-wrap">
      <table className="main-courante-table gardiennage-table">
        <colgroup>
          <col className="gard-col-site" />
          {showPeriode && <col className="gard-col-periode" />}
          <col className="gard-col-creneau" />
          <col className="gard-col-presta" />
          <col className="gard-col-statut" />
          <col className="gard-col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("site")}>Site {sortLabel("site")}</button></th>
            {showPeriode && <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("periode")}>Période {sortLabel("periode")}</button></th>}
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("horaires")}>Horaires {sortLabel("horaires")}</button></th>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("prestataire")}>Prestataire {sortLabel("prestataire")}</button></th>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("statut")}>Statut {sortLabel("statut")}</button></th>
            <th className="col-actions" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {sortedEntries.map((entry) => {
            const canClose = onClose && entry.status !== "CLOTURE" && entry.status !== "ANNULE";
            return (
              <tr key={entry.id} className="mc-table-row">
                <td className="mc-site-wrap">{entry.siteDisplay || <span className="muted">—</span>}</td>

                {showPeriode && (
                  <td>
                    <span className="gardiennage-periode">
                      {formatDateFr(entry.recurrenceStartDate)}
                      {entry.isPonctuel ? null : entry.recurrenceEndDate ? (
                        <> → {formatDateFr(entry.recurrenceEndDate)}</>
                      ) : (
                        <> → <OpenEndedInfinityMark /></>
                      )}
                    </span>
                  </td>
                )}

                {/* Horaires */}
                <td>
                  <div className="gardiennage-creneau-cell">
                    <span className="gardiennage-creneau-label">
                      {entry.startTime ? (
                        isOpenEndedH24(entry) ? (
                          <>
                            {entry.startTime} → <OpenEndedInfinityMark />
                          </>
                        ) : entry.endTime ? (
                          `${entry.startTime} → ${entry.endTime}`
                        ) : (
                          entry.startTime
                        )
                      ) : (
                        "—"
                      )}
                    </span>
                    {entry.crossesMidnight && (
                      <span
                        className="gardiennage-nocturne-icon"
                        title="Créneau nocturne (se termine le lendemain)"
                        aria-label="Créneau nocturne"
                      >
                        <Moon size={13} aria-hidden />
                      </span>
                    )}
                  </div>
                </td>

                <td>{entry.intervenantName || <span className="muted">—</span>}</td>

                {/* Statut */}
                <td>
                  <span className={`mc-status-badge mc-status-badge--${statusTone(entry.status)}`}>
                    <span className="mc-status-badge__dot" aria-hidden />
                    <span className="mc-status-badge__label">{statusLabel(entry.status)}</span>
                    {entry.syncState ? <span className="mc-status-badge__queued">En attente DB</span> : null}
                  </span>
                </td>

                {/* Actions */}
                <td>
                  <div className="row-actions mc-row-actions-wrap">
                    {canClose && (
                      <button
                        type="button"
                        className="mc-table-action-btn mc-table-action-btn--validate"
                        title="Clôturer ce gardiennage"
                        aria-label="Clôturer"
                        onClick={() => onClose(entry)}
                      >
                        <Check size={15} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="mc-table-action-btn"
                      title={
                        entry.status === "CLOTURE" || entry.status === "ANNULE"
                          ? "Consultation uniquement (créneau clôturé ou annulé)"
                          : entry.planningBatchId
                            ? "Modifier toute la planification (lot)"
                            : "Modifier la planification"
                      }
                      aria-label={
                        entry.status === "CLOTURE" || entry.status === "ANNULE"
                          ? "Consulter ce gardiennage"
                          : "Modifier la planification"
                      }
                      onClick={() => onEdit(entry)}
                    >
                      <Pencil size={15} />
                    </button>
                    {onExportWord && (entry.status === "CLOTURE" || entry.status === "ANNULE") ? (
                      <button
                        type="button"
                        className="mc-table-action-btn mc-table-action-btn--word"
                        title="Exporter Word"
                        aria-label="Exporter la fiche Word"
                        onClick={() => onExportWord(entry)}
                      >
                        <FileText size={15} />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="mc-table-action-btn mc-table-action-btn--danger"
                      title="Supprimer"
                      aria-label="Supprimer ce gardiennage"
                      onClick={() => onDelete(entry)}
                    >
                      <Trash2 size={15} />
                    </button>
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
