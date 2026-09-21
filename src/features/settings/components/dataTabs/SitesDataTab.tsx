/**
 * Onglet sites (lecture tableau, modification via modale, motif de suppression).
 */

import { Pencil, Trash2 } from "lucide-react";
import type { SiteRef } from "../../../../types";
import { SiteDisplayCopyButton } from "../../../common/components/SiteDisplayCopyButton";
import { useTableSort } from "../../../common/hooks/useTableSort";
import type { NotifyToast } from "../../../common/model/toast.types";
import { compareTextFr, tableSortArrow, type OpenDeleteReasonModal } from "./common";

type SitesDataTabProps = {
  canDeleteData: boolean;
  filteredSites: SiteRef[];
  pageStart: number;
  pageEnd: number;
  onEditSite: (site: SiteRef) => void;
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
                <SiteDisplayCopyButton
                  variant="table"
                  siteLabel={`${site.name} (${site.code})`}
                  onNotify={props.onNotify}
                />
              </td>
              <td>{site.address || "-"}</td>
              <td>{site.parc || "-"}</td>
              <td>{site.famille || "-"}</td>
              <td>
                <div className="table-actions">
                  <button
                    className="btn-light action-icon-btn"
                    title="Modifier"
                    aria-label="Modifier"
                    onClick={() => props.onEditSite(site)}
                  >
                    <Pencil size={14} />
                  </button>
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
