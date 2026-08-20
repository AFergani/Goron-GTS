/**
 * Onglet motifs de ronde (libellé, couleur).
 */

import type { RondeMotifTypeRef } from "../../../rondes/model/ronde.types";
import type { OpenDeleteReasonModal, SyncOrAsync } from "./common";
import { ReferenceLabelColorRow } from "../shared/ReferenceLabelColorRow";

type RondeMotifsDataTabProps = {
  canDeleteData: boolean;
  pagedRondeMotifs: RondeMotifTypeRef[];
  filteredRondeMotifs: RondeMotifTypeRef[];
  editingRondeMotifId: string | null;
  editingRondeMotifLabel: string;
  editingRondeMotifColor: string;
  setEditingRondeMotifId: (value: string | null) => void;
  setEditingRondeMotifLabel: (value: string) => void;
  setEditingRondeMotifColor: (value: string) => void;
  onUpdateRondeMotifType: (id: string, label: string, colorHex: string) => SyncOrAsync;
  onDeleteRondeMotifType: (id: string, reason: string) => void;
  openDeleteReasonModal: OpenDeleteReasonModal;
};

export function RondeMotifsDataTab(props: RondeMotifsDataTabProps) {
  return (
    <div className="table-scroll-x">
      <table className="data-table-fixed data-table-types">
        <colgroup>
          <col className="data-col-single" />
          <col className="data-col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th>Motif de ronde</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {props.pagedRondeMotifs.map((motifItem) => (
            <ReferenceLabelColorRow
              key={motifItem.id}
              item={motifItem}
              isEditing={props.editingRondeMotifId === motifItem.id}
              editingLabel={props.editingRondeMotifLabel}
              editingColor={props.editingRondeMotifColor}
              canDeleteData={props.canDeleteData}
              onEditStart={(item) => {
                props.setEditingRondeMotifId(item.id);
                props.setEditingRondeMotifLabel(item.label);
                props.setEditingRondeMotifColor(item.colorHex || "#5c6bc0");
              }}
              onEditCancel={() => props.setEditingRondeMotifId(null)}
              onUpdate={(item, label, colorHex) => props.onUpdateRondeMotifType(item.id, label, colorHex)}
              onDelete={(item) => {
                props.openDeleteReasonModal(`motif ${item.label}`, (reason) => props.onDeleteRondeMotifType(item.id, reason));
              }}
              setEditingLabel={props.setEditingRondeMotifLabel}
              setEditingColor={props.setEditingRondeMotifColor}
              systemLabel="Type système"
              colorDefault="#5c6bc0"
            />
          ))}
          {!props.filteredRondeMotifs.length && (
            <tr>
              <td colSpan={2} className="muted">
                Aucun motif de ronde. Ajoutez des libellés pour alimenter les formulaires opérationnels.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
