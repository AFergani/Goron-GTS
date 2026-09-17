/**
 * Tableau journal main courante : tri, badges statut, actions opérateur / responsable.
 *
 * Consultation, édition, traitement (« À suivre » / clôture), copie code site.
 */

import { useLayoutEffect, useRef, useState } from "react";
import { SiteDisplayCopyButton } from "../../common/components/SiteDisplayCopyButton";
import { useTableSort } from "../../common/hooks/useTableSort";
import type { MainCouranteEntry, MainCouranteStatus } from "../model/mainCourante.types";
import { formatMainCouranteDate, statusLabelFr } from "../export/mainCouranteExportFormat";
import type { AnomalyTypeRef } from "../../../types";
import type { NotifyToast } from "../../common/model/toast.types";

function MainCouranteStatusBadge({ status }: { status: MainCouranteStatus }) {
  const label = statusLabelFr(status);
  const variant =
    status === "EN_ATTENTE" ? "en-attente" : status === "EN_COURS" ? "en-cours" : "cloture";
  return (
    <span className={`mc-status-badge mc-status-badge--${variant}`} title={label}>
      <span className="mc-status-badge__dot" aria-hidden />
      <span className="mc-status-badge__label">{label}</span>
    </span>
  );
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

function renderObservationBlock(
  block: ManagerObservationBlock,
  toggle?: { expanded: boolean; onToggle: () => void }
) {
  const metaParts = [block.dateTime, block.managerName].filter(Boolean);
  return (
    <div className="mc-observation-block">
      {metaParts.length > 0 || toggle ? (
        <div className={`mc-observation-meta${toggle ? " mc-observation-meta--with-toggle" : ""}`}>
          <span className="mc-observation-meta__text">{metaParts.join(" - ")}</span>
          {toggle ? (
            <button
              type="button"
              className="mc-observation-expand-btn"
              aria-expanded={toggle.expanded}
              onClick={toggle.onToggle}
            >
              {toggle.expanded ? "Réduire" : "Voir la suite"}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="mc-observation-comment">{block.comment || "—"}</div>
    </div>
  );
}

function ManagerObservationCell({ raw }: { raw: string | undefined }) {
  const blocks = parseManagerObservationBlocks(raw);
  const [expanded, setExpanded] = useState(false);
  const [needsToggle, setNeedsToggle] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const hasMultiple = blocks.length > 1;

  useLayoutEffect(() => {
    if (hasMultiple) {
      setNeedsToggle(true);
      return;
    }
    if (expanded) {
      setNeedsToggle(true);
      return;
    }
    const el = contentRef.current;
    if (!el) {
      setNeedsToggle(false);
      return;
    }
    setNeedsToggle(el.scrollHeight > el.clientHeight + 1);
  }, [raw, expanded, hasMultiple, blocks.length]);

  if (!blocks.length) {
    return <span className="muted">—</span>;
  }

  const restBlocks = hasMultiple && expanded ? blocks.slice(1) : [];
  const toggle = needsToggle
    ? { expanded, onToggle: () => setExpanded((prev) => !prev) }
    : undefined;
  const showMoreHint = needsToggle && (!expanded || restBlocks.length > 0);

  return (
    <div className="mc-observation-cell">
      <div
        ref={contentRef}
        className={`mc-observation-list${!expanded && !hasMultiple ? " mc-observation-list--collapsed" : ""}`}
      >
        {renderObservationBlock(blocks[0], toggle)}
      </div>
      {showMoreHint ? (
        <div className="mc-observation-sep" aria-hidden>
          ---
        </div>
      ) : null}
      {restBlocks.length > 0 ? (
        <div className="mc-observation-list">
          {restBlocks.map((block, index) => (
            <div key={`${block.dateTime}-${index + 1}`}>
              {index > 0 ? (
                <div className="mc-observation-sep" aria-hidden>
                  ---
                </div>
              ) : null}
              {renderObservationBlock(block)}
            </div>
          ))}
        </div>
      ) : null}
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
  onViewEntry
}: MainCouranteTableProps) {
  type MainCouranteSortKey = "dailyCode" | "date" | "operator" | "site" | "type" | "info" | "status";

  const comparators: Record<MainCouranteSortKey, (a: MainCouranteEntry, b: MainCouranteEntry) => number> = {
    dailyCode: (a: MainCouranteEntry, b: MainCouranteEntry) => (a.dailyCode || "").localeCompare(b.dailyCode || "", "fr"),
    date: (a: MainCouranteEntry, b: MainCouranteEntry) => (a.createdAt || "").localeCompare(b.createdAt || ""),
    operator: (a: MainCouranteEntry, b: MainCouranteEntry) => (a.operatorName || "").localeCompare(b.operatorName || "", "fr"),
    site: (a: MainCouranteEntry, b: MainCouranteEntry) => (a.siteDisplay || "").localeCompare(b.siteDisplay || "", "fr"),
    type: (a: MainCouranteEntry, b: MainCouranteEntry) => (a.anomalyTypeLabel || "").localeCompare(b.anomalyTypeLabel || "", "fr"),
    info: (a: MainCouranteEntry, b: MainCouranteEntry) => (a.information || "").localeCompare(b.information || "", "fr"),
    status: (a: MainCouranteEntry, b: MainCouranteEntry) => statusLabelFr(a.status).localeCompare(statusLabelFr(b.status), "fr")
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
        <col className="col-daily-code" />
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
          <th className="col-daily-code"><button type="button" className="table-sort-btn" onClick={() => toggleSort("dailyCode")}>N° {sortLabel("dailyCode")}</button></th>
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
            <td className="col-daily-code">{entry.dailyCode || "—"}</td>
            <td className="mc-col-date">{formatMainCouranteDate(entry.createdAt)}</td>
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
                <div className="row-actions table-row-actions table-row-actions--text">
                  {canOperatorEdit(entry) && (
                    <button
                      type="button"
                      className="table-action-btn table-action-btn--text"
                      onClick={() => onEditEntry(entry)}
                    >
                      Modifier
                    </button>
                  )}
                  {isManager && entry.status === "EN_ATTENTE" && (
                    <button
                      type="button"
                      className="table-action-btn table-action-btn--text table-action-btn--validate"
                      onClick={() => onManagerTreat(entry)}
                    >
                      Valider
                    </button>
                  )}
                  {isManager && entry.status === "EN_COURS" && (
                    <button
                      type="button"
                      className="table-action-btn table-action-btn--text"
                      onClick={() => onManagerTreat(entry)}
                    >
                      Clôturer
                    </button>
                  )}
                  {canViewDetail(entry) && (
                    <button
                      type="button"
                      className="table-action-btn table-action-btn--text"
                      onClick={() => onViewEntry(entry)}
                    >
                      Ouvrir la fiche
                    </button>
                  )}
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
