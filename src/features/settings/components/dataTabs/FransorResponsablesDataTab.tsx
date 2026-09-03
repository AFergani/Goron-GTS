/**
 * Onglet responsables Fransor (référentiel module Fransor).
 */

import { Pencil, RotateCcw, Save, Trash2 } from "lucide-react";
import type { FransorResponsableRef } from "../../../../types";
import { useTableSort } from "../../../common/hooks/useTableSort";
import { compareTextFr, tableSortArrow, type OpenDeleteReasonModal, type SyncOrAsync } from "./common";

type FransorResponsablesDataTabProps = {
  canDeleteData: boolean;
  filteredFransorResponsables: FransorResponsableRef[];
  pageStart: number;
  pageEnd: number;
  editingFransorResponsableId: string | null;
  editingFransorResponsableName: string;
  setEditingFransorResponsableId: (value: string | null) => void;
  setEditingFransorResponsableName: (value: string) => void;
  onUpdateFransorResponsable: (id: string, name: string) => SyncOrAsync;
  onDeleteFransorResponsable: (id: string, reason: string) => void;
  openDeleteReasonModal: OpenDeleteReasonModal;
};

type FransorSortKey = "name";

export function FransorResponsablesDataTab(props: FransorResponsablesDataTabProps) {
  const comparators: Record<FransorSortKey, (a: FransorResponsableRef, b: FransorResponsableRef) => number> = {
    name: (a, b) => compareTextFr(a.name, b.name)
  };
  const { sortedEntries, sortDirection, sortKey, toggleSort } = useTableSort<FransorResponsableRef, FransorSortKey>(
    props.filteredFransorResponsables,
    comparators,
    { key: "name", direction: "asc" }
  );
  const pagedFransorResponsables = sortedEntries.slice(props.pageStart, props.pageEnd);
  const sortLabel = (key: FransorSortKey) => tableSortArrow(sortKey, key, sortDirection);

  return (
    <div className="table-scroll-x">
      <table className="data-table-fixed data-table-intervenants">
        <colgroup>
          <col className="data-col-single" />
          <col className="data-col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th>
              <button type="button" className="table-sort-btn" onClick={() => toggleSort("name")}>
                Responsable Fransor {sortLabel("name")}
              </button>
            </th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {pagedFransorResponsables.map((resp) => (
            <tr key={resp.id}>
              <td>
                {props.editingFransorResponsableId === resp.id ? (
                  <input
                    value={props.editingFransorResponsableName}
                    onChange={(e) => props.setEditingFransorResponsableName(e.target.value)}
                  />
                ) : (
                  resp.name
                )}
              </td>
              <td>
                <div className="table-actions">
                  {props.editingFransorResponsableId === resp.id ? (
                    <>
                      <button
                        className="btn-light action-icon-btn"
                        title="Sauvegarder"
                        aria-label="Sauvegarder"
                        onClick={() => {
                          void props.onUpdateFransorResponsable(resp.id, props.editingFransorResponsableName);
                          props.setEditingFransorResponsableId(null);
                        }}
                      >
                        <Save size={14} />
                      </button>
                      <button
                        className="btn-light action-icon-btn"
                        title="Annuler"
                        aria-label="Annuler"
                        onClick={() => props.setEditingFransorResponsableId(null)}
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
                        props.setEditingFransorResponsableId(resp.id);
                        props.setEditingFransorResponsableName(resp.name);
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
                        props.openDeleteReasonModal(`responsable ${resp.name}`, (reason) =>
                          props.onDeleteFransorResponsable(resp.id, reason)
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
          {!props.filteredFransorResponsables.length && (
            <tr>
              <td colSpan={2} className="muted">
                Aucun responsable Fransor.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
