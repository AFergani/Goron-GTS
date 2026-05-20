import { Pencil, RotateCcw, Save, Trash2 } from "lucide-react";
import type { IntervenantRef } from "../../../../types";
import type { PendingInterventionIntervenant } from "../../../intervention/model/intervention.types";
import type { OpenDeleteReasonModal, SyncOrAsync } from "./common";

type IntervenantsDataTabProps = {
  canDeleteData: boolean;
  interventionPendingIntervenants: PendingInterventionIntervenant[];
  pagedIntervenants: IntervenantRef[];
  filteredIntervenants: IntervenantRef[];
  editingIntervenantId: string | null;
  editingIntervenantName: string;
  setEditingIntervenantId: (value: string | null) => void;
  setEditingIntervenantName: (value: string) => void;
  onUpdateIntervenant: (id: string, name: string) => SyncOrAsync;
  onDeleteIntervenant: (id: string, reason: string) => void;
  onOpenPendingIntervenantValidation: (item: PendingInterventionIntervenant) => void;
  onDeletePendingIntervenantSubmission: (payload: { pendingId: string; reason: string }) => SyncOrAsync;
  openDeleteReasonModal: OpenDeleteReasonModal;
};

export function IntervenantsDataTab(props: IntervenantsDataTabProps) {
  return (
    <>
      {props.interventionPendingIntervenants.length ? (
        <>
          <div className="data-inline-pending-box">
            <strong>Intervenants en attente:</strong> {props.interventionPendingIntervenants.length} soumission(s) à traiter.
          </div>
          <div className="table-scroll-x">
            <table className="data-table-fixed data-table-intervenants">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Créé par</th>
                  <th>Créé le</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {props.interventionPendingIntervenants.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.createdBy}</td>
                    <td>{new Date(item.createdAt).toLocaleString("fr-FR")}</td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="btn-light action-icon-btn"
                          title="Valider cet intervenant en attente"
                          aria-label="Valider cet intervenant en attente"
                          onClick={() => props.onOpenPendingIntervenantValidation(item)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="btn-danger action-icon-btn"
                          title="Supprimer la soumission"
                          aria-label="Supprimer la soumission"
                          onClick={() => {
                            props.openDeleteReasonModal(`intervenant en attente ${item.name}`, (reason) =>
                              props.onDeletePendingIntervenantSubmission({ pendingId: item.id, reason })
                            );
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <div className="table-scroll-x">
        <table className="data-table-fixed data-table-intervenants">
          <colgroup>
            <col className="data-col-single" />
            <col className="data-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {props.pagedIntervenants.map((intervenant) => (
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
    </>
  );
}
