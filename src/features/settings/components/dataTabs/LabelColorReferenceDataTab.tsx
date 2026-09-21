/**
 * Onglet générique référentiel libellé + couleur (types d’anomalie, motifs de ronde).
 * L’édition se fait dans la modale du panneau, pas en ligne.
 */

import { useTableSort } from "../../../common/hooks/useTableSort";
import { ReferenceLabelColorRow } from "../shared/ReferenceLabelColorRow";
import { compareTextFr, tableSortArrow, type OpenDeleteReasonModal } from "./common";

type LabelColorItem = {
  id: string;
  label: string;
  colorHex?: string | null;
  isSystem?: boolean;
};

type LabelColorReferenceDataTabProps<T extends LabelColorItem> = {
  canDeleteData: boolean;
  filteredItems: T[];
  pageStart: number;
  pageEnd: number;
  onEdit: (item: T) => void;
  onDelete: (id: string, reason: string) => void;
  openDeleteReasonModal: OpenDeleteReasonModal;
  columnLabel: string;
  emptyMessage: string;
  colorDefault: string;
  systemLabel?: string;
  deleteReasonPrefix: string;
};

type SortKey = "label";

export function LabelColorReferenceDataTab<T extends LabelColorItem>(props: LabelColorReferenceDataTabProps<T>) {
  const comparators: Record<SortKey, (a: T, b: T) => number> = {
    label: (a, b) => compareTextFr(a.label, b.label)
  };
  const { sortedEntries, sortDirection, sortKey, toggleSort } = useTableSort<T, SortKey>(
    props.filteredItems,
    comparators,
    { key: "label", direction: "asc" }
  );
  const paged = sortedEntries.slice(props.pageStart, props.pageEnd);
  const sortLabel = (key: SortKey) => tableSortArrow(sortKey, key, sortDirection);

  return (
    <div className="table-scroll-x">
      <table className="data-table-fixed data-table-types">
        <colgroup>
          <col className="data-col-single" />
          <col className="data-col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th>
              <button type="button" className="table-sort-btn" onClick={() => toggleSort("label")}>
                {props.columnLabel} {sortLabel("label")}
              </button>
            </th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {paged.map((item) => (
            <ReferenceLabelColorRow
              key={item.id}
              item={item}
              canDeleteData={props.canDeleteData}
              onEdit={props.onEdit}
              onDelete={(row) => {
                props.openDeleteReasonModal(`${props.deleteReasonPrefix} ${row.label}`, (reason) =>
                  props.onDelete(row.id, reason)
                );
              }}
              systemLabel={props.systemLabel ?? "Type système"}
              colorDefault={props.colorDefault}
            />
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
