import { Pencil, Trash2 } from "lucide-react";
import type { PendingInterventionSite } from "../../../intervention/model/intervention.types";

type PendingSitesDataTabProps = {
  pagedPendingSites: PendingInterventionSite[];
  hasAnyPendingSites: boolean;
  onValidate: (site: PendingInterventionSite) => void;
  onDelete: (site: PendingInterventionSite) => void;
};

export function PendingSitesDataTab(props: PendingSitesDataTabProps) {
  return (
    <div className="table-scroll-x">
      <table className="data-table-fixed data-table-sites">
        <thead>
          <tr>
            <th>Code</th>
            <th>Nom</th>
            <th>Créé par</th>
            <th>Créé le</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {props.pagedPendingSites.map((site) => (
            <tr key={site.id}>
              <td>{site.code}</td>
              <td>{site.name}</td>
              <td>{site.createdBy}</td>
              <td>{new Date(site.createdAt).toLocaleString("fr-FR")}</td>
              <td>
                <div className="table-actions">
                  <button
                    className="btn-light action-icon-btn"
                    title="Valider ce site en attente"
                    aria-label="Valider ce site en attente"
                    onClick={() => props.onValidate(site)}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="btn-danger action-icon-btn"
                    title="Supprimer la soumission"
                    aria-label="Supprimer la soumission"
                    onClick={() => props.onDelete(site)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {!props.hasAnyPendingSites ? (
            <tr>
              <td colSpan={5} className="muted">
                Aucun site en attente de validation.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
