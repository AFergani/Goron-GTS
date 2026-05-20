import { Pencil, RotateCcw, Save, Trash2 } from "lucide-react";
import type { AnomalyTypeRef } from "../../../../types";
import type { OpenDeleteReasonModal, SyncOrAsync } from "./common";

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
            <tr key={typeItem.id}>
              <td>
                {props.editingTypeId === typeItem.id ? (
                  <div className="data-type-edit-fields">
                    <input value={props.editingTypeLabel} onChange={(e) => props.setEditingTypeLabel(e.target.value)} />
                    <input
                      type="color"
                      value={props.editingTypeColor}
                      onChange={(e) => props.setEditingTypeColor(e.target.value)}
                      title="Couleur du badge"
                      aria-label="Couleur du badge"
                    />
                  </div>
                ) : (
                  <span className="data-type-label-with-color">
                    <span className="data-type-color-dot" style={{ backgroundColor: typeItem.colorHex }} aria-hidden />
                    {typeItem.label}
                  </span>
                )}
              </td>
              <td>
                <div className="table-actions">
                  {props.editingTypeId === typeItem.id ? (
                    <>
                      <button
                        className="btn-light action-icon-btn"
                        title="Sauvegarder"
                        aria-label="Sauvegarder"
                        onClick={() => {
                          void props.onUpdateType(typeItem.id, props.editingTypeLabel, props.editingTypeColor);
                          props.setEditingTypeId(null);
                        }}
                      >
                        <Save size={14} />
                      </button>
                      <button
                        className="btn-light action-icon-btn"
                        title="Annuler"
                        aria-label="Annuler"
                        onClick={() => props.setEditingTypeId(null)}
                      >
                        <RotateCcw size={14} />
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn-light action-icon-btn"
                      title="Modifier"
                      aria-label="Modifier"
                      onClick={() => {
                        props.setEditingTypeId(typeItem.id);
                        props.setEditingTypeLabel(typeItem.label);
                        props.setEditingTypeColor(typeItem.colorHex || "#1f5fcf");
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  {props.canDeleteData && (
                    <button
                      className="btn-danger action-icon-btn"
                      title="Supprimer"
                      aria-label="Supprimer"
                      onClick={() => {
                        props.openDeleteReasonModal(`type ${typeItem.label}`, (reason) => props.onDeleteType(typeItem.id, reason));
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
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
