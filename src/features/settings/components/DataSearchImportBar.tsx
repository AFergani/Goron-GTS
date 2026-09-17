/**
 * Barre recherche + import Excel + reset filtres (onglets données).
 */

import { Plus, RotateCcw } from "lucide-react";
import type { DataTab } from "../model/settings.types";

type DataSearchImportBarProps = {
  activeDataTab: DataTab;
  searchQuery: string;
  searchPlaceholder: string;
  siteParcFilter: string;
  siteFamilleFilter: string;
  siteParcOptions: string[];
  siteFamilleOptions: string[];
  importColumnsHint: string;
  isImporting: boolean;
  pendingSubmissionsCount: number;
  onSearchQueryChange: (value: string) => void;
  onSiteParcFilterChange: (value: string) => void;
  onSiteFamilleFilterChange: (value: string) => void;
  onResetSearch: () => void;
  onOpenImport: () => void;
  onOpenCreate: () => void;
  onOpenPendingSubmissions: () => void;
  showImport: boolean;
  showCreate: boolean;
};

export function DataSearchImportBar(props: DataSearchImportBarProps) {
  const isSitesTab = props.activeDataTab === "sites";
  const showPendingButton =
    (props.activeDataTab === "sites" || props.activeDataTab === "intervenants") &&
    props.pendingSubmissionsCount > 0;

  return (
    <div className="data-actions-bar">
      <input
        type="text"
        placeholder={props.searchPlaceholder}
        value={props.searchQuery}
        onChange={(e) => props.onSearchQueryChange(e.target.value)}
      />
      {isSitesTab ? (
        <>
          <select
            value={props.siteParcFilter}
            onChange={(e) => props.onSiteParcFilterChange(e.target.value)}
            title="Filtrer par parc"
            aria-label="Filtrer par parc"
          >
            <option value="">Tous les parcs</option>
            {props.siteParcOptions.map((item) => (
              <option key={item} value={item}>
                Parc: {item}
              </option>
            ))}
          </select>
          <select
            value={props.siteFamilleFilter}
            onChange={(e) => props.onSiteFamilleFilterChange(e.target.value)}
            title="Filtrer par famille"
            aria-label="Filtrer par famille"
          >
            <option value="">Toutes les familles</option>
            {props.siteFamilleOptions.map((item) => (
              <option key={item} value={item}>
                Famille: {item}
              </option>
            ))}
          </select>
        </>
      ) : null}
      <button
        className="btn-light action-icon-btn"
        title="Réinitialiser la recherche et les filtres"
        aria-label="Réinitialiser la recherche et les filtres"
        onClick={props.onResetSearch}
      >
        <RotateCcw size={14} />
      </button>
      {showPendingButton ? (
        <button
          type="button"
          className="btn-light data-pending-submissions-btn"
          title={`${props.pendingSubmissionsCount} soumission(s) à traiter`}
          onClick={props.onOpenPendingSubmissions}
        >
          Voir les soumissions
          <span className="tab-badge" aria-hidden>
            {props.pendingSubmissionsCount}
          </span>
        </button>
      ) : null}
      {props.showImport ? (
        <button
          type="button"
          className="btn-light"
          title={`Importer (XLS ou XLSX). ${props.importColumnsHint}`}
          aria-label="Importer"
          onClick={props.onOpenImport}
          disabled={props.isImporting}
        >
          <Plus size={16} aria-hidden />
          Importer
        </button>
      ) : null}
      {props.showCreate ? (
        <button
          type="button"
          className="mc-btn-primary"
          title={`Créer une entrée manuellement. ${props.importColumnsHint}`}
          onClick={props.onOpenCreate}
        >
          <Plus size={16} aria-hidden />
          Nouvelle entrée
        </button>
      ) : null}
    </div>
  );
}
