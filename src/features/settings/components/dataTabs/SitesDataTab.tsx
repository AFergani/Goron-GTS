/**
 * Onglet sites (CRUD, motif de suppression).
 */

import { Pencil, RotateCcw, Save, Trash2 } from "lucide-react";
import type { SiteRef } from "../../../../types";
import { SiteDisplayCopyButton } from "../../../common/components/SiteDisplayCopyButton";
import { useTableSort } from "../../../common/hooks/useTableSort";
import type { NotifyToast } from "../../../common/model/toast.types";
import { compareTextFr, tableSortArrow, type OpenDeleteReasonModal, type SyncOrAsync } from "./common";

type SitesDataTabProps = {
  canDeleteData: boolean;
  filteredSites: SiteRef[];
  pageStart: number;
  pageEnd: number;
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
  openDeleteReasonModal: OpenDeleteReasonModal;
  onNotify?: NotifyToast;
};

type SiteSortKey = "site" | "address" | "parc" | "famille";

export function SitesDataTab(props: SitesDataTabProps) {
  const siteComparators: Record<SiteSortKey, (a: SiteRef, b: SiteRef) => number> = {
    site: (a, b) => compareTextFr(`${a.name} (${a.code})`, `${b.name} (${b.code})`),
    address: (a, b) => compareTextFr(a.address, b.address),
    parc: (a, b) => compareTextFr(a.parc, b.parc),
    famille: (a, b) => compareTextFr(a.famille, b.famille)
  };
  const { sortedEntries, sortDirection, sortKey, toggleSort } = useTableSort<SiteRef, SiteSortKey>(
    props.filteredSites,
    siteComparators,
    { key: "site", direction: "asc" }
  );
  const pagedSites = sortedEntries.slice(props.pageStart, props.pageEnd);
  const sortLabel = (key: SiteSortKey) => tableSortArrow(sortKey, key, sortDirection);

  return (
    <div className="table-scroll-x">
      <table className="data-table-fixed data-table-sites">
        <colgroup>
          <col className="data-col-site" />
          <col className="data-col-name" />
          <col className="data-col-parc" />
          <col className="data-col-famille" />
          <col className="data-col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th>
              <button type="button" className="table-sort-btn" onClick={() => toggleSort("site")}>
                Site {sortLabel("site")}
              </button>
            </th>
            <th>
              <button type="button" className="table-sort-btn" onClick={() => toggleSort("address")}>
                Adresse site {sortLabel("address")}
              </button>
            </th>
            <th>
              <button type="button" className="table-sort-btn" onClick={() => toggleSort("parc")}>
                Parc {sortLabel("parc")}
              </button>
            </th>
            <th>
              <button type="button" className="table-sort-btn" onClick={() => toggleSort("famille")}>
                Famille {sortLabel("famille")}
              </button>
            </th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {pagedSites.map((site) => (
            <tr key={site.id}>
              <td className="mc-site-wrap">
                {props.editingSiteId === site.id ? (
                  <div className="data-site-edit-fields">
                    <input
                      aria-label="Nom du site"
                      placeholder="Nom du site"
                      value={props.editingSiteName}
                      onChange={(e) => props.setEditingSiteName(e.target.value)}
                    />
                    <input
                      aria-label="Code site"
                      placeholder="Code site"
                      value={props.editingSiteCode}
                      onChange={(e) => props.setEditingSiteCode(e.target.value)}
                    />
                  </div>
                ) : (
                  <SiteDisplayCopyButton
                    variant="table"
                    siteLabel={`${site.name} (${site.code})`}
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
              <td colSpan={5} className="muted">
                Aucun site. Import : Site, Code site, Adresse, CP/Ville, Parc, Famille (fichier XLS ou XLSX ; Adresse et CP/Ville sont
                fusionnés dans le champ adresse).
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
