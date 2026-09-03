/**
 * Onglet générique référentiel libellé + couleur (types d’anomalie, motifs de ronde).
 */

import { useTableSort } from "../../../common/hooks/useTableSort";
import { ReferenceLabelColorRow } from "../shared/ReferenceLabelColorRow";
import { compareTextFr, tableSortArrow, type OpenDeleteReasonModal, type SyncOrAsync } from "./common";

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
  editingId: string | null;
  editingLabel: string;
  editingColor: string;
  setEditingId: (value: string | null) => void;
  setEditingLabel: (value: string) => void;
  setEditingColor: (value: string) => void;
  onUpdate: (id: string, label: string, colorHex: string) => SyncOrAsync;
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
              isEditing={props.editingId === item.id}
              editingLabel={props.editingLabel}
              editingColor={props.editingColor}
              canDeleteData={props.canDeleteData}
              onEditStart={(row) => {
                props.setEditingId(row.id);
                props.setEditingLabel(row.label);
                props.setEditingColor(row.colorHex || props.colorDefault);
              }}
              onEditCancel={() => props.setEditingId(null)}
              onUpdate={(row, label, colorHex) => props.onUpdate(row.id, label, colorHex)}
              onDelete={(row) => {
                props.openDeleteReasonModal(`${props.deleteReasonPrefix} ${row.label}`, (reason) =>
                  props.onDelete(row.id, reason)
                );
              }}
              setEditingLabel={props.setEditingLabel}
              setEditingColor={props.setEditingColor}
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
