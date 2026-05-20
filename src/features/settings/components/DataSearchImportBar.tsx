import { RotateCcw } from "lucide-react";
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
  onSearchQueryChange: (value: string) => void;
  onSiteParcFilterChange: (value: string) => void;
  onSiteFamilleFilterChange: (value: string) => void;
  onResetSearch: () => void;
  onOpenImport: () => void;
  onOpenCreate: () => void;
  showImport: boolean;
  showCreate: boolean;
};

export function DataSearchImportBar(props: DataSearchImportBarProps) {
  const isSitesTab = props.activeDataTab === "sites";

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
      {props.showImport ? (
        <button
          className="btn-light"
          title={`Importer en masse (XLS ou XLSX) — plusieurs fichiers possibles, traitement l’un après l’autre. ${props.importColumnsHint}`}
          onClick={props.onOpenImport}
          disabled={props.isImporting}
        >
          Importer en masse
        </button>
      ) : null}
      {props.showCreate ? (
        <button title={`Créer une entrée manuellement. ${props.importColumnsHint}`} onClick={props.onOpenCreate}>
          Ajouter une entrée
        </button>
      ) : null}
    </div>
  );
}
