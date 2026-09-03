/**
 * Tableau journal main courante : tri, badges statut, actions opérateur / responsable.
 *
 * Consultation, édition, traitement (« À suivre » / clôture), copie code site.
 */

import { SiteDisplayCopyButton } from "../../common/components/SiteDisplayCopyButton";
import { useTableSort } from "../../common/hooks/useTableSort";
import type { MainCouranteEntry, MainCouranteStatus } from "../model/mainCourante.types";
import type { AnomalyTypeRef } from "../../../types";
import type { NotifyToast } from "../../common/model/toast.types";

function statusLabel(status: MainCouranteStatus) {
  if (status === "EN_ATTENTE") return "En attente";
  if (status === "EN_COURS") return "En cours";
  return "Clôturé";
}

function MainCouranteStatusBadge({ status }: { status: MainCouranteStatus }) {
  const label = statusLabel(status);
  const variant =
    status === "EN_ATTENTE" ? "en-attente" : status === "EN_COURS" ? "en-cours" : "cloture";
  return (
    <span className={`mc-status-badge mc-status-badge--${variant}`} title={label}>
      <span className="mc-status-badge__dot" aria-hidden />
      <span className="mc-status-badge__label">{label}</span>
    </span>
  );
}

function formatMcDate(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function MainCouranteTypeBadge({ label, colorHex }: { label: string; colorHex?: string }) {
  const safeColor = colorHex && /^#[0-9a-fA-F]{6}$/.test(colorHex) ? colorHex : "#1f5fcf";
  return (
    <span
      className="mc-type-badge"
      title={label}
      style={{
        color: safeColor,
        borderColor: `${safeColor}88`,
        backgroundColor: `${safeColor}22`
      }}
    >
      <span className="mc-type-badge__label">{label}</span>
    </span>
  );
}

type ManagerObservationBlock = {
  dateTime: string;
  managerName: string;
  comment: string;
};

/**
 * Découpe le champ cumulé (`date: Responsable : texte` séparés par `---`)
 * pour un affichage méta + commentaire.
 */
function parseManagerObservationBlocks(raw: string | undefined): ManagerObservationBlock[] {
  const text = String(raw || "").trim();
  if (!text) return [];

  return text
    .split(/\n---\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const firstSep = chunk.indexOf(": ");
      if (firstSep < 0) {
        return { dateTime: "", managerName: "", comment: chunk };
      }
      const dateTime = chunk.slice(0, firstSep).trim();
      const rest = chunk.slice(firstSep + 2);
      const secondSep = rest.indexOf(" : ");
      if (secondSep < 0) {
        return { dateTime, managerName: "", comment: rest.trim() };
      }
      return {
        dateTime,
        managerName: rest.slice(0, secondSep).trim(),
        comment: rest.slice(secondSep + 3).trim()
      };
    });
}

function ManagerObservationCell({ raw }: { raw: string | undefined }) {
  const blocks = parseManagerObservationBlocks(raw);
  if (!blocks.length) {
    return <span className="muted">—</span>;
  }

  return (
    <div className="mc-observation-list">
      {blocks.map((block, index) => {
        const metaParts = [block.dateTime, block.managerName].filter(Boolean);
        return (
          <div key={`${block.dateTime}-${index}`} className="mc-observation-block">
            {index > 0 ? <div className="mc-observation-sep" aria-hidden>
              ---
            </div> : null}
            {metaParts.length > 0 ? (
              <div className="mc-observation-meta">{metaParts.join(" - ")}</div>
            ) : null}
            <div className="mc-observation-comment">{block.comment || "—"}</div>
          </div>
        );
      })}
    </div>
  );
}

type MainCouranteTableProps = {
  entries: MainCouranteEntry[];
  anomalyTypes: AnomalyTypeRef[];
  currentOperatorName: string;
  isManager: boolean;
  onNotify?: NotifyToast;
  onEditEntry: (entry: MainCouranteEntry) => void;
  onManagerTreat: (entry: MainCouranteEntry) => void;
  onExportWord: (entry: MainCouranteEntry) => void | Promise<void>;
  onViewEntry: (entry: MainCouranteEntry) => void;
};

export function MainCouranteTable({
  entries,
  anomalyTypes,
  currentOperatorName,
  isManager,
  onNotify,
  onEditEntry,
  onManagerTreat,
  onExportWord,
  onViewEntry
}: MainCouranteTableProps) {
  type MainCouranteSortKey = "date" | "operator" | "site" | "type" | "info" | "status";

  const comparators: Record<MainCouranteSortKey, (a: MainCouranteEntry, b: MainCouranteEntry) => number> = {
    date: (a: MainCouranteEntry, b: MainCouranteEntry) => (a.createdAt || "").localeCompare(b.createdAt || ""),
    operator: (a: MainCouranteEntry, b: MainCouranteEntry) => (a.operatorName || "").localeCompare(b.operatorName || "", "fr"),
    site: (a: MainCouranteEntry, b: MainCouranteEntry) => (a.siteDisplay || "").localeCompare(b.siteDisplay || "", "fr"),
    type: (a: MainCouranteEntry, b: MainCouranteEntry) => (a.anomalyTypeLabel || "").localeCompare(b.anomalyTypeLabel || "", "fr"),
    info: (a: MainCouranteEntry, b: MainCouranteEntry) => (a.information || "").localeCompare(b.information || "", "fr"),
    status: (a: MainCouranteEntry, b: MainCouranteEntry) => statusLabel(a.status).localeCompare(statusLabel(b.status), "fr")
  };
  const { sortedEntries, sortDirection, sortKey, toggleSort } = useTableSort<MainCouranteEntry, MainCouranteSortKey>(entries, comparators, {
    key: "date",
    direction: "desc"
  });
  const sortLabel = (key: MainCouranteSortKey) => (sortKey === key ? (sortDirection === "asc" ? "↑" : "↓") : "↕");

  if (!entries.length) {
    return <p className="muted">Aucune entrée pour le moment.</p>;
  }

  const canOperatorEdit = (entry: MainCouranteEntry) => entry.status === "EN_ATTENTE" && entry.operatorName === currentOperatorName;
  const canManagerTreat = (entry: MainCouranteEntry) => isManager && entry.status !== "CLOTURE";
  const canOpenViaPrimaryAction = (entry: MainCouranteEntry) => canOperatorEdit(entry) || canManagerTreat(entry);
  /** Affiché seulement s'il n'y a pas déjà une action métier (Modifier / Valider / Clôturer). */
  const canViewDetail = (entry: MainCouranteEntry) => {
    if (canOpenViaPrimaryAction(entry)) return false;
    if (isManager) return entry.status === "CLOTURE";
    if (entry.operatorName !== currentOperatorName) return true;
    return entry.status !== "EN_ATTENTE";
  };

  return (
    <div className="main-courante-table-wrap">
      <table className="main-courante-table mc-entries-table">
      <colgroup>
        <col className="mc-col-date" />
        <col className="mc-col-site" />
        <col className="mc-col-operator" />
        <col className="mc-col-type" />
        <col className="mc-col-information" />
        <col className="mc-col-observation" />
        <col className="mc-col-status-actions" />
      </colgroup>
      <thead>
        <tr>
          <th className="mc-col-date"><button type="button" className="table-sort-btn" onClick={() => toggleSort("date")}>Date {sortLabel("date")}</button></th>
          <th className="mc-col-site"><button type="button" className="table-sort-btn" onClick={() => toggleSort("site")}>Site {sortLabel("site")}</button></th>
          <th className="mc-col-operator"><button type="button" className="table-sort-btn" onClick={() => toggleSort("operator")}>Opérateur {sortLabel("operator")}</button></th>
          <th className="mc-col-type"><button type="button" className="table-sort-btn" onClick={() => toggleSort("type")}>Type {sortLabel("type")}</button></th>
          <th className="mc-col-information"><button type="button" className="table-sort-btn" onClick={() => toggleSort("info")}>Information {sortLabel("info")}</button></th>
          <th className="mc-col-observation">Observation responsable</th>
          <th className="mc-col-status-actions"><button type="button" className="table-sort-btn" onClick={() => toggleSort("status")}>État / Actions {sortLabel("status")}</button></th>
        </tr>
      </thead>
      <tbody>
        {sortedEntries.map((entry) => (
          <tr key={entry.id}>
            <td className="mc-col-date">{formatMcDate(entry.createdAt)}</td>
            <td className="mc-col-site mc-site-wrap">
              <SiteDisplayCopyButton variant="table" siteLabel={entry.siteDisplay || ""} onNotify={onNotify} />
            </td>
            <td className="mc-col-operator">{entry.operatorName}</td>
            <td className="mc-col-type">
              <MainCouranteTypeBadge
                label={entry.anomalyTypeLabel}
                colorHex={anomalyTypes.find((typeItem) => typeItem.id === entry.anomalyTypeId)?.colorHex}
              />
            </td>
            <td className="mc-col-information mc-cell-wrap">{entry.information}</td>
            <td className="mc-col-observation">
              <ManagerObservationCell raw={entry.managerObservation} />
            </td>
            <td className="mc-col-status-actions">
              <div className="mc-status-actions-stack">
                <MainCouranteStatusBadge status={entry.status} />
                <div className="row-actions mc-row-actions-wrap mc-row-actions-wrap--text">
                  {canOperatorEdit(entry) && (
                    <button
                      type="button"
                      className="mc-table-action-btn mc-table-action-btn--text"
                      onClick={() => onEditEntry(entry)}
                    >
                      Modifier
                    </button>
                  )}
                  {isManager && entry.status === "EN_ATTENTE" && (
                    <button
                      type="button"
                      className="mc-table-action-btn mc-table-action-btn--text mc-table-action-btn--validate"
                      onClick={() => onManagerTreat(entry)}
                    >
                      Valider
                    </button>
                  )}
                  {isManager && entry.status === "EN_COURS" && (
                    <button
                      type="button"
                      className="mc-table-action-btn mc-table-action-btn--text"
                      onClick={() => onManagerTreat(entry)}
                    >
                      Clôturer
                    </button>
                  )}
                  {canViewDetail(entry) && (
                    <button
                      type="button"
                      className="mc-table-action-btn mc-table-action-btn--text"
                      onClick={() => onViewEntry(entry)}
                    >
                      Voir le détail
                    </button>
                  )}
                  <button
                    type="button"
                    className="mc-table-action-btn mc-table-action-btn--text mc-table-action-btn--word"
                    onClick={() => void onExportWord(entry)}
                  >
                    Export Word
                  </button>
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
