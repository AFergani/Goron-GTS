/**
 * Rendu partagé pour les référentiels de type libellé + couleur.
 *
 * Utilisé par les types d'anomalie et les motifs de ronde, qui partagent la même
 * logique d'édition inline : <input libellé> + <input type="color"> + boutons.
 */

import { Pencil, RotateCcw, Save, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

type ReferenceItem = {
  id: string;
  label: string;
  colorHex?: string | null;
  isSystem?: boolean;
};

type ReferenceLabelColorRowProps<T extends ReferenceItem> = {
  item: T;
  isEditing: boolean;
  editingLabel: string;
  editingColor: string;
  canDeleteData: boolean;
  onEditStart: (item: T) => void;
  onEditCancel: () => void;
  onUpdate: (item: T, label: string, colorHex: string) => void | Promise<void>;
  onDelete: (item: T) => void;
  setEditingLabel: (value: string) => void;
  setEditingColor: (value: string) => void;
  systemLabel?: string;
  colorDefault: string;
  getDeleteTargetLabel?: (item: T) => string;
  renderExtraAction?: (item: T) => ReactNode;
};

export function ReferenceLabelColorRow<T extends ReferenceItem>({
  item,
  isEditing,
  editingLabel,
  editingColor,
  canDeleteData,
  onEditStart,
  onEditCancel,
  onUpdate,
  onDelete,
  setEditingLabel,
  setEditingColor,
  systemLabel = "Type système",
  colorDefault,
  getDeleteTargetLabel,
  renderExtraAction
}: ReferenceLabelColorRowProps<T>) {
  return (
    <tr key={item.id}>
      <td>
        {isEditing ? (
          <div className="data-type-edit-fields">
            <input value={editingLabel} onChange={(e) => setEditingLabel(e.target.value)} />
            <input
              type="color"
              value={editingColor || colorDefault}
              onChange={(e) => setEditingColor(e.target.value)}
              title="Couleur du badge"
              aria-label="Couleur du badge"
            />
          </div>
        ) : (
          <span className="data-type-label-with-color">
            <span className="data-type-color-dot" style={{ backgroundColor: item.colorHex || colorDefault }} aria-hidden />
            {item.label}
          </span>
        )}
      </td>
      <td>
        {item.isSystem ? (
          <span className="muted" title={`${systemLabel} : non modifiable ni supprimable`}>
            {systemLabel}
          </span>
        ) : (
          <div className="table-actions">
            {isEditing ? (
              <>
                <button
                  className="btn-light action-icon-btn"
                  title="Sauvegarder"
                  aria-label="Sauvegarder"
                  onClick={() => {
                    void onUpdate(item, editingLabel, editingColor || colorDefault);
                    onEditCancel();
                  }}
                >
                  <Save size={14} />
                </button>
                <button
                  className="btn-light action-icon-btn"
                  title="Annuler"
                  aria-label="Annuler"
                  onClick={onEditCancel}
                >
                  <RotateCcw size={14} />
                </button>
              </>
            ) : (
              <button
                className="btn-light action-icon-btn"
                title="Modifier"
                aria-label="Modifier"
                onClick={() => onEditStart(item)}
              >
                <Pencil size={14} />
              </button>
            )}
            {renderExtraAction ? renderExtraAction(item) : null}
            {canDeleteData && (
              <button
                className="btn-danger action-icon-btn"
                title="Supprimer"
                aria-label="Supprimer"
                onClick={() => onDelete(item)}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
