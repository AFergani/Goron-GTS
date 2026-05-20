import { Eye } from "lucide-react";
import { SiteDisplayCopyButton } from "../../common/components/SiteDisplayCopyButton";
import { useTableSort } from "../../common/hooks/useTableSort";
import type { MainCouranteEntry, MainCouranteStatus } from "../model/mainCourante.types";
import type { AnomalyTypeRef } from "../../../types";

function IconPencil() {
  return (
    <svg
      className="mc-action-icon-svg"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg
      className="mc-action-icon-svg"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconTraiter() {
  return (
    <svg
      className="mc-action-icon-svg"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

function IconWordExport() {
  return (
    <svg
      className="mc-action-icon-svg"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </svg>
  );
}

function statusLabel(status: MainCouranteStatus) {
  if (status === "EN_ATTENTE") return "En attente";
  if (status === "EN_COURS") return "En cours";
  return "Clôturé";
}

function MainCouranteStatusBadge({ status, syncState }: { status: MainCouranteStatus; syncState?: "PENDING_QUEUE" }) {
  const label = statusLabel(status);
  const variant =
    status === "EN_ATTENTE" ? "en-attente" : status === "EN_COURS" ? "en-cours" : "cloture";
  return (
    <span className={`mc-status-badge mc-status-badge--${variant}`} title={syncState ? `${label} - En file d'attente writer` : label}>
      <span className="mc-status-badge__dot" aria-hidden />
      <span className="mc-status-badge__label">{label}</span>
      {syncState ? <span className="mc-status-badge__queued">En attente DB</span> : null}
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

type MainCouranteTableProps = {
  entries: MainCouranteEntry[];
  anomalyTypes: AnomalyTypeRef[];
  currentOperatorName: string;
  isManager: boolean;
  onNotify?: (message: string) => void;
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
  if (!entries.length) {
    return <p className="muted">Aucune entrée pour le moment.</p>;
  }

  const canOperatorEdit = (entry: MainCouranteEntry) => entry.status === "EN_ATTENTE" && entry.operatorName === currentOperatorName;
  const canManagerTreat = (entry: MainCouranteEntry) => isManager && entry.status !== "CLOTURE";
  const canOpenViaPrimaryAction = (entry: MainCouranteEntry) => canOperatorEdit(entry) || canManagerTreat(entry);
  const canViewByEye = (entry: MainCouranteEntry) => {
    if (canOpenViaPrimaryAction(entry)) return false;
    if (isManager) return entry.status === "CLOTURE";
    if (entry.operatorName !== currentOperatorName) return true;
    return entry.status !== "EN_ATTENTE";
  };

  const comparators = {
    date: (a: MainCouranteEntry, b: MainCouranteEntry) => (a.createdAt || "").localeCompare(b.createdAt || ""),
    operator: (a: MainCouranteEntry, b: MainCouranteEntry) => (a.operatorName || "").localeCompare(b.operatorName || "", "fr"),
    manager: (a: MainCouranteEntry, b: MainCouranteEntry) => (a.managerName || "").localeCompare(b.managerName || "", "fr"),
    site: (a: MainCouranteEntry, b: MainCouranteEntry) => (a.siteDisplay || "").localeCompare(b.siteDisplay || "", "fr"),
    type: (a: MainCouranteEntry, b: MainCouranteEntry) => (a.anomalyTypeLabel || "").localeCompare(b.anomalyTypeLabel || "", "fr"),
    info: (a: MainCouranteEntry, b: MainCouranteEntry) => (a.information || "").localeCompare(b.information || "", "fr"),
    status: (a: MainCouranteEntry, b: MainCouranteEntry) => statusLabel(a.status).localeCompare(statusLabel(b.status), "fr")
  } as const;
  const { sortedEntries, sortDirection, sortKey, toggleSort } = useTableSort(entries, comparators, { key: "date", direction: "desc" });
  const sortLabel = (key: keyof typeof comparators) => (sortKey === key ? (sortDirection === "asc" ? "↑" : "↓") : "↕");

  return (
    <div className="main-courante-table-wrap">
      <table className="main-courante-table mc-entries-table">
      <colgroup>
        <col className="mc-col-date" />
        <col className="mc-col-operator" />
        <col className="mc-col-manager" />
        <col className="mc-col-site" />
        <col className="mc-col-type" />
        <col className="mc-col-information" />
        <col className="mc-col-observation" />
        <col className="mc-col-status" />
        <col className="mc-col-actions" />
      </colgroup>
      <thead>
        <tr>
          <th className="mc-col-date"><button type="button" className="table-sort-btn" onClick={() => toggleSort("date")}>Date {sortLabel("date")}</button></th>
          <th className="mc-col-operator"><button type="button" className="table-sort-btn" onClick={() => toggleSort("operator")}>Opérateur {sortLabel("operator")}</button></th>
          <th className="mc-col-manager"><button type="button" className="table-sort-btn" onClick={() => toggleSort("manager")}>Responsable {sortLabel("manager")}</button></th>
          <th className="mc-col-site"><button type="button" className="table-sort-btn" onClick={() => toggleSort("site")}>Site {sortLabel("site")}</button></th>
          <th className="mc-col-type"><button type="button" className="table-sort-btn" onClick={() => toggleSort("type")}>Type {sortLabel("type")}</button></th>
          <th className="mc-col-information"><button type="button" className="table-sort-btn" onClick={() => toggleSort("info")}>Information {sortLabel("info")}</button></th>
          <th className="mc-col-observation">Obs. resp.</th>
          <th className="mc-col-status"><button type="button" className="table-sort-btn" onClick={() => toggleSort("status")}>État {sortLabel("status")}</button></th>
          <th className="mc-col-actions">Actions</th>
        </tr>
      </thead>
      <tbody>
        {sortedEntries.map((entry) => (
          <tr key={entry.id}>
            <td className="mc-col-date">{formatMcDate(entry.createdAt)}</td>
            <td className="mc-col-operator">{entry.operatorName}</td>
            <td className="mc-col-manager">{entry.managerName || "—"}</td>
            <td className="mc-col-site mc-site-wrap">
              <SiteDisplayCopyButton variant="table" siteLabel={entry.siteDisplay || ""} onNotify={onNotify} />
            </td>
            <td className="mc-col-type">
              <MainCouranteTypeBadge
                label={entry.anomalyTypeLabel}
                colorHex={anomalyTypes.find((typeItem) => typeItem.id === entry.anomalyTypeId)?.colorHex}
              />
            </td>
            <td className="mc-col-information mc-cell-wrap">{entry.information}</td>
            <td className="mc-col-observation mc-cell-wrap">{entry.managerObservation || "—"}</td>
            <td className="mc-col-status">
              <MainCouranteStatusBadge status={entry.status} syncState={entry.syncState} />
            </td>
            <td className="mc-col-actions">
              <div className="row-actions mc-row-actions-wrap">
                {canOperatorEdit(entry) && (
                  <button
                    type="button"
                    className="mc-table-action-btn"
                    onClick={() => onEditEntry(entry)}
                    title="Modifier"
                    aria-label="Modifier l’entrée"
                  >
                    <IconPencil />
                  </button>
                )}
                {isManager && entry.status === "EN_ATTENTE" && (
                  <button
                    type="button"
                    className="mc-table-action-btn mc-table-action-btn--validate"
                    onClick={() => onManagerTreat(entry)}
                    title="Valider"
                    aria-label="Valider l’entrée"
                  >
                    <IconCheck />
                  </button>
                )}
                {isManager && entry.status === "EN_COURS" && (
                  <button
                    type="button"
                    className="mc-table-action-btn"
                    onClick={() => onManagerTreat(entry)}
                    title="Clôturer"
                    aria-label="Clôturer l’entrée"
                  >
                    <IconTraiter />
                  </button>
                )}
                {canViewByEye(entry) ? (
                  <button
                    type="button"
                    className="mc-table-action-btn"
                    onClick={() => onViewEntry(entry)}
                    title="Voir le détail"
                    aria-label="Voir le détail de l’entrée"
                  >
                    <Eye size={16} />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="mc-table-action-btn mc-table-action-btn--word"
                  onClick={() => void onExportWord(entry)}
                  title="Exporter en Word"
                  aria-label="Exporter cette entrée en document Word"
                >
                  <IconWordExport />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
      </table>
    </div>
  );
}
