/**
 * Onglet générique référentiel « nom seul » (intervenants, responsables Fransor).
 * L’édition se fait dans la modale du panneau, pas en ligne.
 */

import { Pencil, Trash2 } from "lucide-react";
import { useTableSort } from "../../../common/hooks/useTableSort";
import { compareTextFr, tableSortArrow, type OpenDeleteReasonModal } from "./common";

type NameOnlyItem = {
  id: string;
  name: string;
};

type NameOnlyReferenceDataTabProps<T extends NameOnlyItem> = {
  canDeleteData: boolean;
  filteredItems: T[];
  pageStart: number;
  pageEnd: number;
  columnLabel: string;
  emptyMessage: string;
  deleteReasonPrefix: string;
  tableClassName?: string;
  onEdit: (item: T) => void;
  onDelete: (id: string, reason: string) => void;
  openDeleteReasonModal: OpenDeleteReasonModal;
};

type SortKey = "name";

export function NameOnlyReferenceDataTab<T extends NameOnlyItem>(props: NameOnlyReferenceDataTabProps<T>) {
  const comparators: Record<SortKey, (a: T, b: T) => number> = {
    name: (a, b) => compareTextFr(a.name, b.name)
  };
  const { sortedEntries, sortDirection, sortKey, toggleSort } = useTableSort<T, SortKey>(
    props.filteredItems,
    comparators,
    { key: "name", direction: "asc" }
  );
  const paged = sortedEntries.slice(props.pageStart, props.pageEnd);
  const sortLabel = (key: SortKey) => tableSortArrow(sortKey, key, sortDirection);
  const tableClass = props.tableClassName ?? "data-table-intervenants";

  return (
    <div className="table-scroll-x">
      <table className={`data-table-fixed ${tableClass}`}>
        <colgroup>
          <col className="data-col-single" />
          <col className="data-col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th>
              <button type="button" className="table-sort-btn" onClick={() => toggleSort("name")}>
                {props.columnLabel} {sortLabel("name")}
              </button>
            </th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {paged.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>
                <div className="table-actions">
                  <button
                    className="btn-light action-icon-btn"
                    title="Modifier"
                    aria-label="Modifier"
                    onClick={() => props.onEdit(item)}
                  >
                    <Pencil size={14} />
                  </button>
                  {props.canDeleteData && (
                    <button
                      className="btn-danger action-icon-btn"
                      title="Supprimer"
                      aria-label="Supprimer"
                      onClick={() => {
                        props.openDeleteReasonModal(`${props.deleteReasonPrefix} ${item.name}`, (reason) =>
                          props.onDelete(item.id, reason)
                        );
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {!props.filteredItems.length && (
            <tr>
              <td colSpan={2} className="muted">
                {props.emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
