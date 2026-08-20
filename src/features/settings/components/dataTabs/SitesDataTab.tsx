/**
 * Onglet sites (CRUD, motif de suppression).
 */

import { Pencil, RotateCcw, Save, Trash2 } from "lucide-react";
import type { SiteRef } from "../../../../types";
import type { PendingSite } from "../../../common/model/pendingRefs.types";
import { SiteDisplayCopyButton } from "../../../common/components/SiteDisplayCopyButton";
import type { NotifyToast } from "../../../common/model/toast.types";
import type { OpenDeleteReasonModal, SyncOrAsync } from "./common";

type SitesDataTabProps = {
  canDeleteData: boolean;
  pendingSites: PendingSite[];
  pagedSites: SiteRef[];
  filteredSites: SiteRef[];
  editingSiteId: string | null;
  editingSiteCode: string;
  editingSiteName: string;
  editingSiteAddress: string;
  editingSiteParc: string;
  editingSiteFamille: string;
  setEditingSiteId: (value: string | null) => void;
  setEditingSiteCode: (value: string) => void;
  setEditingSiteName: (value: string) => void;
  setEditingSiteAddress: (value: string) => void;
  setEditingSiteParc: (value: string) => void;
  setEditingSiteFamille: (value: string) => void;
  onUpdateSite: (payload: { id: string; code: string; name: string; address: string; parc: string; famille: string }) => SyncOrAsync;
  onDeleteSite: (id: string, reason: string) => void;
  onOpenPendingSiteValidation: (site: PendingSite) => void;
  onDeletePendingSiteSubmission: (payload: { pendingId: string; reason: string }) => SyncOrAsync;
  openDeleteReasonModal: OpenDeleteReasonModal;
  onNotify?: NotifyToast;
};

export function SitesDataTab(props: SitesDataTabProps) {
  return (
    <>
      {props.pendingSites.length ? (
        <>
          <div className="data-inline-pending-box">
            <strong>Sites en attente:</strong> {props.pendingSites.length} soumission(s) à traiter.
          </div>
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
                {props.pendingSites.map((site) => (
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
                          onClick={() => props.onOpenPendingSiteValidation(site)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="btn-danger action-icon-btn"
                          title="Supprimer la soumission"
                          aria-label="Supprimer la soumission"
                          onClick={() => {
                            props.openDeleteReasonModal(`site en attente ${site.code}`, (reason) =>
                              props.onDeletePendingSiteSubmission({ pendingId: site.id, reason })
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
        <table className="data-table-fixed data-table-sites">
          <colgroup>
            <col className="data-col-code" />
            <col className="data-col-name" />
            <col className="data-col-name" />
            <col className="data-col-parc" />
            <col className="data-col-famille" />
            <col className="data-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>Code site</th>
              <th>Site</th>
              <th>Adresse site</th>
              <th>Parc</th>
              <th>Famille</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {props.pagedSites.map((site) => (
              <tr key={site.id}>
                <td>{props.editingSiteId === site.id ? <input value={props.editingSiteCode} onChange={(e) => props.setEditingSiteCode(e.target.value)} /> : site.code}</td>
                <td className="mc-site-wrap">
                  {props.editingSiteId === site.id ? (
                    <input value={props.editingSiteName} onChange={(e) => props.setEditingSiteName(e.target.value)} />
                  ) : (
                    <SiteDisplayCopyButton
                      variant="table"
                      siteLabel={site.name}
                      copySource={`${site.name} (${site.code})`}
                      onNotify={props.onNotify}
                    />
                  )}
                </td>
                <td>
                  {props.editingSiteId === site.id ? (
                    <input value={props.editingSiteAddress} onChange={(e) => props.setEditingSiteAddress(e.target.value)} />
                  ) : (
                    site.address || "-"
                  )}
                </td>
                <td>
                  {props.editingSiteId === site.id ? (
                    <input value={props.editingSiteParc} onChange={(e) => props.setEditingSiteParc(e.target.value)} />
                  ) : (
                    site.parc || "-"
                  )}
                </td>
                <td>
                  {props.editingSiteId === site.id ? (
                    <input value={props.editingSiteFamille} onChange={(e) => props.setEditingSiteFamille(e.target.value)} />
                  ) : (
                    site.famille || "-"
                  )}
                </td>
                <td>
                  <div className="table-actions">
                    {props.editingSiteId === site.id ? (
                      <>
                        <button
                          className="btn-light action-icon-btn"
                          title="Sauvegarder"
                          aria-label="Sauvegarder"
                          onClick={() => {
                            void props.onUpdateSite({
                              id: site.id,
                              code: props.editingSiteCode,
                              name: props.editingSiteName,
                              address: props.editingSiteAddress,
                              parc: props.editingSiteParc,
                              famille: props.editingSiteFamille
                            });
                            props.setEditingSiteId(null);
                          }}
                        >
                          <Save size={14} />
                        </button>
                        <button
                          className="btn-light action-icon-btn"
                          title="Annuler"
                          aria-label="Annuler"
                          onClick={() => props.setEditingSiteId(null)}
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
                          props.setEditingSiteId(site.id);
                          props.setEditingSiteCode(site.code);
                          props.setEditingSiteName(site.name);
                          props.setEditingSiteAddress(site.address || "");
                          props.setEditingSiteParc(site.parc || "");
                          props.setEditingSiteFamille(site.famille || "");
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
                          props.openDeleteReasonModal(`site ${site.code}`, (reason) => props.onDeleteSite(site.id, reason));
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!props.filteredSites.length && (
              <tr>
                <td colSpan={6} className="muted">
                  Aucun site. Import : Site, Code site, Adresse, CP/Ville, Parc, Famille (fichier XLS ou XLSX ; Adresse et CP/Ville sont
                  fusionnés dans le champ adresse).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
