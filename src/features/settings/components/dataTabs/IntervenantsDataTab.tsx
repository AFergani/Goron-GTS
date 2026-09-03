/**
 * Onglet prestataires / intervenants (CRUD).
 */

import { Pencil, RotateCcw, Save, Trash2 } from "lucide-react";
import type { IntervenantRef } from "../../../../types";
import { useTableSort } from "../../../common/hooks/useTableSort";
import { compareTextFr, tableSortArrow, type OpenDeleteReasonModal, type SyncOrAsync } from "./common";

type IntervenantsDataTabProps = {
  canDeleteData: boolean;
  filteredIntervenants: IntervenantRef[];
  pageStart: number;
  pageEnd: number;
  editingIntervenantId: string | null;
  editingIntervenantName: string;
  setEditingIntervenantId: (value: string | null) => void;
  setEditingIntervenantName: (value: string) => void;
  onUpdateIntervenant: (id: string, name: string) => SyncOrAsync;
  onDeleteIntervenant: (id: string, reason: string) => void;
  openDeleteReasonModal: OpenDeleteReasonModal;
};

type IntervenantSortKey = "name";

export function IntervenantsDataTab(props: IntervenantsDataTabProps) {
  const comparators: Record<IntervenantSortKey, (a: IntervenantRef, b: IntervenantRef) => number> = {
    name: (a, b) => compareTextFr(a.name, b.name)
  };
  const { sortedEntries, sortDirection, sortKey, toggleSort } = useTableSort<IntervenantRef, IntervenantSortKey>(
    props.filteredIntervenants,
    comparators,
    { key: "name", direction: "asc" }
  );
  const pagedIntervenants = sortedEntries.slice(props.pageStart, props.pageEnd);
  const sortLabel = (key: IntervenantSortKey) => tableSortArrow(sortKey, key, sortDirection);

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
                Nom {sortLabel("name")}
              </button>
            </th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {pagedIntervenants.map((intervenant) => (
            <tr key={intervenant.id}>
              <td>
                {props.editingIntervenantId === intervenant.id ? (
                  <input value={props.editingIntervenantName} onChange={(e) => props.setEditingIntervenantName(e.target.value)} />
                ) : (
                  intervenant.name
                )}
              </td>
              <td>
                <div className="table-actions">
                  {props.editingIntervenantId === intervenant.id ? (
                    <>
                      <button
                        className="btn-light action-icon-btn"
                        title="Sauvegarder"
                        aria-label="Sauvegarder"
                        onClick={() => {
                          void props.onUpdateIntervenant(intervenant.id, props.editingIntervenantName);
                          props.setEditingIntervenantId(null);
                        }}
                      >
                        <Save size={14} />
                      </button>
                      <button
                        className="btn-light action-icon-btn"
                        title="Annuler"
                        aria-label="Annuler"
                        onClick={() => props.setEditingIntervenantId(null)}
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
                        props.setEditingIntervenantId(intervenant.id);
                        props.setEditingIntervenantName(intervenant.name);
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
                        props.openDeleteReasonModal(`intervenant ${intervenant.name}`, (reason) =>
                          props.onDeleteIntervenant(intervenant.id, reason)
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
          {!props.filteredIntervenants.length && (
            <tr>
              <td colSpan={2} className="muted">
                Aucun intervenant. Colonne attendue pour l'import: nom (alias: intervenant, intervenants, société,
                prestataire, entreprise).
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
