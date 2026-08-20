/**
 * Tableau des gardiennages (tri colonnes, badges type et statut).
 *
 * Actions : clôturer (si actif/planifié), modifier, supprimer.
 * Colonne Période optionnelle (affichage liste).
 * Vue journée : `hoursForDate` affiche la portion horaire du jour, pas le créneau entier.
 * Date de création + badge de type (H24 / récurrent / ponctuel, jour ou nuit) dans les deux vues.
 * Colonne Site : clic pour copier le code (comme les autres tableaux métier).
 */

import { Check, Infinity, Moon, Pencil, Trash2 } from "lucide-react";
import { SiteDisplayCopyButton } from "../../common/components/SiteDisplayCopyButton";
import { useTableSort } from "../../common/hooks/useTableSort";
import type { NotifyToast } from "../../common/model/toast.types";
import type { GardiennageEntry } from "../model/gardiennage.types";
import { canManuallyCloseGardiennage, gardiennageCloseBlockedLabel } from "../model/gardiennageClosure";
import { clipGardiennageHoursToDay, formatGardiennageDayHours } from "../model/gardiennageDayHours";
import { classifyGardiennageKind } from "../model/gardiennageKind";

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
 * @returns Libellé React (texte, infini H24 ouvert, ou tiret)
 */
function renderHoursLabel(entry: GardiennageEntry, hoursForDate?: string) {
  if (hoursForDate) {
    const clipped = clipGardiennageHoursToDay(entry, hoursForDate);
    return clipped ? formatGardiennageDayHours(clipped) : "—";
  }
  if (!entry.startTime) return "—";
  if (isOpenEndedH24(entry)) {
    return (
      <>
        {entry.startTime} → <OpenEndedInfinityMark />
      </>
    );
  }
  return entry.endTime ? `${entry.startTime} → ${entry.endTime}` : entry.startTime;
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
  if (!entries.length) {
    return <p className="muted">Aucun gardiennage à afficher.</p>;
  }

  type GardiennageSortKey = "createdAt" | "site" | "periode" | "horaires" | "prestataire" | "statut";

  const comparators: Record<GardiennageSortKey, (a: GardiennageEntry, b: GardiennageEntry) => number> = {
    createdAt: (a: GardiennageEntry, b: GardiennageEntry) => (a.createdAt || "").localeCompare(b.createdAt || ""),
    site: (a: GardiennageEntry, b: GardiennageEntry) => (a.siteDisplay || "").localeCompare(b.siteDisplay || "", "fr"),
    periode: (a: GardiennageEntry, b: GardiennageEntry) =>
      `${a.recurrenceStartDate || ""}|${a.recurrenceEndDate || ""}`.localeCompare(`${b.recurrenceStartDate || ""}|${b.recurrenceEndDate || ""}`),
    horaires: (a: GardiennageEntry, b: GardiennageEntry) => `${a.startTime || ""}|${a.endTime || ""}`.localeCompare(`${b.startTime || ""}|${b.endTime || ""}`),
    prestataire: (a: GardiennageEntry, b: GardiennageEntry) => (a.intervenantName || "").localeCompare(b.intervenantName || "", "fr"),
    statut: (a: GardiennageEntry, b: GardiennageEntry) => statusLabel(a.status).localeCompare(statusLabel(b.status), "fr")
  };
  const { sortedEntries, sortDirection, sortKey, toggleSort } = useTableSort<GardiennageEntry, GardiennageSortKey>(entries, comparators, {
    key: "createdAt",
    direction: "desc"
  });
  const sortLabel = (key: GardiennageSortKey) => (sortKey === key ? (sortDirection === "asc" ? "↑" : "↓") : "↕");

  return (
    <div className="main-courante-table-wrap">
      <table className="main-courante-table gardiennage-table">
        <colgroup>
          <col className="gard-col-created" />
          <col className="gard-col-site" />
          {showPeriode && <col className="gard-col-periode" />}
          <col className="gard-col-creneau" />
          <col className="gard-col-presta" />
          <col className="gard-col-statut" />
          <col className="gard-col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th><button type="button" className="table-sort-btn" onClick={() => toggleSort("createdAt")}>Créé le {sortLabel("createdAt")}</button></th>
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
            const closeBlocked = gardiennageCloseBlockedLabel(entry);
            const canClose = Boolean(onClose) && canManuallyCloseGardiennage(entry);
            const showCloseDisabled = Boolean(onClose) && entry.status !== "CLOTURE" && entry.status !== "ANNULE" && !canClose;
            return (
              <tr key={entry.id} className="mc-table-row">
                <td className="gardiennage-created-cell">
                  <GardiennageKindBadge entry={entry} />
                  <span title={formatCreatedAtTitle(entry.createdAt) || undefined}>
                    {formatCreatedAtDate(entry.createdAt)}
                  </span>
                </td>
                <td className="mc-site-wrap">
                  <SiteDisplayCopyButton variant="table" siteLabel={entry.siteDisplay || ""} onNotify={onNotify} />
                </td>

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
                      {renderHoursLabel(entry, hoursForDate)}
                    </span>
                    {!hoursForDate && entry.crossesMidnight && (
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
                  </span>
                </td>

                {/* Actions */}
                <td>
                  <div className="row-actions mc-row-actions-wrap">
                    {(canClose || showCloseDisabled) && (
                      <span
                        className="mc-table-action-btn-wrap"
                        title={canClose ? "Clôturer ce gardiennage" : closeBlocked}
                      >
                        <button
                          type="button"
                          className="mc-table-action-btn mc-table-action-btn--validate"
                          title={canClose ? "Clôturer ce gardiennage" : closeBlocked}
                          aria-label={canClose ? "Clôturer" : closeBlocked}
                          disabled={showCloseDisabled}
                          onClick={() => {
                            if (!canClose) return;
                            onClose?.(entry);
                          }}
                        >
                          <Check size={15} />
                        </button>
                      </span>
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
