/**
 * Ligne de tableau pour les référentiels libellé + couleur.
 *
 * Utilisée par les types d'anomalie et les motifs de ronde.
 * L’édition se fait dans la modale du panneau, pas en ligne.
 */

import { Pencil, Trash2 } from "lucide-react";

type ReferenceItem = {
  id: string;
  label: string;
  colorHex?: string | null;
  isSystem?: boolean;
};

type ReferenceLabelColorRowProps<T extends ReferenceItem> = {
  item: T;
  canDeleteData: boolean;
  onEdit: (item: T) => void;
  onDelete: (item: T) => void;
  systemLabel?: string;
  colorDefault: string;
};

export function ReferenceLabelColorRow<T extends ReferenceItem>({
  item,
  canDeleteData,
  onEdit,
  onDelete,
  systemLabel = "Type système",
  colorDefault
}: ReferenceLabelColorRowProps<T>) {
  return (
    <tr>
      <td>
        <span className="data-type-label-with-color">
          <span className="data-type-color-dot" style={{ backgroundColor: item.colorHex || colorDefault }} aria-hidden />
          {item.label}
        </span>
      </td>
      <td>
        {item.isSystem ? (
          <div className="table-actions">
            <span className="muted" title={`${systemLabel} : non modifiable ni supprimable`}>
              {systemLabel}
            </span>
          </div>
        ) : (
          <div className="table-actions">
            <button
              className="btn-light action-icon-btn"
              title="Modifier"
              aria-label="Modifier"
              onClick={() => onEdit(item)}
            >
              <Pencil size={14} />
            </button>
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
