/**
 * Onglet motifs de ronde (libellé, couleur).
 */

import { Pencil, RotateCcw, Save, Trash2 } from "lucide-react";
import type { RondeMotifTypeRef } from "../../../rondes/model/ronde.types";
import type { OpenDeleteReasonModal, SyncOrAsync } from "./common";

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
            <tr key={motifItem.id}>
              <td>
                {props.editingRondeMotifId === motifItem.id ? (
                  <div className="data-type-edit-fields">
                    <input value={props.editingRondeMotifLabel} onChange={(e) => props.setEditingRondeMotifLabel(e.target.value)} />
                    <input
                      type="color"
                      value={props.editingRondeMotifColor}
                      onChange={(e) => props.setEditingRondeMotifColor(e.target.value)}
                      title="Couleur du badge"
                      aria-label="Couleur du badge"
                    />
                  </div>
                ) : (
                  <span className="data-type-label-with-color">
                    <span className="data-type-color-dot" style={{ backgroundColor: motifItem.colorHex }} aria-hidden />
                    {motifItem.label}
                  </span>
                )}
              </td>
              <td>
                {motifItem.isSystem ? (
                  <span className="muted" title="Motif système : non modifiable ni supprimable">
                    Type système
                  </span>
                ) : (
                  <div className="table-actions">
                    {props.editingRondeMotifId === motifItem.id ? (
                      <>
                        <button
                          className="btn-light action-icon-btn"
                          title="Sauvegarder"
                          aria-label="Sauvegarder"
                          onClick={() => {
                            void props.onUpdateRondeMotifType(
                              motifItem.id,
                              props.editingRondeMotifLabel,
                              props.editingRondeMotifColor
                            );
                            props.setEditingRondeMotifId(null);
                          }}
                        >
                          <Save size={14} />
                        </button>
                        <button
                          className="btn-light action-icon-btn"
                          title="Annuler"
                          aria-label="Annuler"
                          onClick={() => props.setEditingRondeMotifId(null)}
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
                          props.setEditingRondeMotifId(motifItem.id);
                          props.setEditingRondeMotifLabel(motifItem.label);
                          props.setEditingRondeMotifColor(motifItem.colorHex || "#5c6bc0");
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
                          props.openDeleteReasonModal(`motif ${motifItem.label}`, (reason) =>
                            props.onDeleteRondeMotifType(motifItem.id, reason)
                          );
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
              </td>
            </tr>
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
