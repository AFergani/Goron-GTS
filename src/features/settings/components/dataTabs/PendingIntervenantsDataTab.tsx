/**
 * Onglet intervenants proposés en attente (validation ou rejet).
 */

import { Pencil, Trash2 } from "lucide-react";
import type { PendingInterventionIntervenant } from "../../../intervention/model/intervention.types";

type PendingIntervenantsDataTabProps = {
  pagedPendingIntervenants: PendingInterventionIntervenant[];
  hasAnyPendingIntervenants: boolean;
  onValidate: (item: PendingInterventionIntervenant) => void;
  onDelete: (item: PendingInterventionIntervenant) => void;
};

export function PendingIntervenantsDataTab(props: PendingIntervenantsDataTabProps) {
  return (
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
          {props.pagedPendingIntervenants.map((item) => (
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
                    onClick={() => props.onValidate(item)}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="btn-danger action-icon-btn"
                    title="Supprimer la soumission"
                    aria-label="Supprimer la soumission"
                    onClick={() => props.onDelete(item)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {!props.hasAnyPendingIntervenants ? (
            <tr>
              <td colSpan={4} className="muted">
                Aucun intervenant en attente de validation.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
