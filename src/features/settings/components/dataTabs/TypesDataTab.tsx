/**
 * Onglet types d’anomalie main courante (libellé, couleur).
 */

import type { AnomalyTypeRef } from "../../../../types";
import type { OpenDeleteReasonModal, SyncOrAsync } from "./common";
import { ReferenceLabelColorRow } from "../shared/ReferenceLabelColorRow";

type TypesDataTabProps = {
  canDeleteData: boolean;
  pagedTypes: AnomalyTypeRef[];
  filteredTypes: AnomalyTypeRef[];
  editingTypeId: string | null;
  editingTypeLabel: string;
  editingTypeColor: string;
  setEditingTypeId: (value: string | null) => void;
  setEditingTypeLabel: (value: string) => void;
  setEditingTypeColor: (value: string) => void;
  onUpdateType: (id: string, label: string, colorHex: string) => SyncOrAsync;
  onDeleteType: (id: string, reason: string) => void;
  openDeleteReasonModal: OpenDeleteReasonModal;
};

export function TypesDataTab(props: TypesDataTabProps) {
  return (
    <div className="table-scroll-x">
      <table className="data-table-fixed data-table-types">
        <colgroup>
          <col className="data-col-single" />
          <col className="data-col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th>Type d'anomalie</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {props.pagedTypes.map((typeItem) => (
            <ReferenceLabelColorRow
              key={typeItem.id}
              item={typeItem}
              isEditing={props.editingTypeId === typeItem.id}
              editingLabel={props.editingTypeLabel}
              editingColor={props.editingTypeColor}
              canDeleteData={props.canDeleteData}
              onEditStart={(item) => {
                props.setEditingTypeId(item.id);
                props.setEditingTypeLabel(item.label);
                props.setEditingTypeColor(item.colorHex || "#1f5fcf");
              }}
              onEditCancel={() => props.setEditingTypeId(null)}
              onUpdate={(item, label, colorHex) => props.onUpdateType(item.id, label, colorHex)}
              onDelete={(item) => {
                props.openDeleteReasonModal(`type ${item.label}`, (reason) => props.onDeleteType(item.id, reason));
              }}
              setEditingLabel={props.setEditingTypeLabel}
              setEditingColor={props.setEditingTypeColor}
              systemLabel="Type système"
              colorDefault="#1f5fcf"
            />
          ))}
          {!props.filteredTypes.length && (
            <tr>
              <td colSpan={2} className="muted">
                Aucun type d'anomalie. Colonne attendue pour l'import: type anomalie (ou libellé).
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
