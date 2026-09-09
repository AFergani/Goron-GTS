/**
 * Barre de filtres listes « service site » (recherche, période, famille, prestataire, statut).
 *
 * S’appuie sur `TableFiltersBar`. Utilisé par : interventions, gardiennage, rondes
 * (via `RondeListFiltersBar`).
 */

import { TableFiltersBar } from "./TableFiltersBar";

export type ServiceListStatusOption = {
  value: string;
  label: string;
};

export type ServiceListIntervenantOption = {
  id: string;
  name: string;
};

/** Options statut par défaut (interventions / gardiennage). */
export const DEFAULT_SERVICE_LIST_STATUS_OPTIONS: ServiceListStatusOption[] = [
  { value: "EN_COURS", label: "En cours" },
  { value: "", label: "Tous" },
  { value: "CLOTURE", label: "Clôturé" },
  { value: "ANNULE", label: "Annulé" }
];

type ServiceListFiltersBarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
  onReset: () => void;
  searchPlaceholder?: string;
  familyFilter: string;
  onFamilyFilterChange: (value: string) => void;
  familyOptions: string[];
  intervenantFilter: string;
  onIntervenantFilterChange: (value: string) => void;
  intervenantOptions: ServiceListIntervenantOption[];
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  statusOptions?: ServiceListStatusOption[];
  /** Libellé du select statut (défaut : Statut). */
  statusLabel?: string;
};

export function ServiceListFiltersBar({
  search,
  onSearchChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  onReset,
  searchPlaceholder = "Site, prestataire…",
  familyFilter,
  onFamilyFilterChange,
  familyOptions,
  intervenantFilter,
  onIntervenantFilterChange,
  intervenantOptions,
  statusFilter,
  onStatusFilterChange,
  statusOptions = DEFAULT_SERVICE_LIST_STATUS_OPTIONS,
  statusLabel = "Statut"
}: ServiceListFiltersBarProps) {
  return (
    <div className="list-panel-filters">
      <TableFiltersBar
        search={search}
        onSearchChange={onSearchChange}
        dateFrom={dateFrom}
        onDateFromChange={onDateFromChange}
        dateTo={dateTo}
        onDateToChange={onDateToChange}
        searchPlaceholder={searchPlaceholder}
        onReset={onReset}
      >
        <label>
          Famille
          <select value={familyFilter} onChange={(e) => onFamilyFilterChange(e.target.value)}>
            <option value="">Toutes</option>
            {familyOptions.map((family) => (
              <option key={family} value={family}>
                {family}
              </option>
            ))}
          </select>
        </label>
        <label>
          Prestataire
          <select value={intervenantFilter} onChange={(e) => onIntervenantFilterChange(e.target.value)}>
            <option value="">Tous</option>
            {intervenantOptions.map((intervenant) => (
              <option key={intervenant.id} value={intervenant.id}>
                {intervenant.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {statusLabel}
          <select value={statusFilter} onChange={(e) => onStatusFilterChange(e.target.value)}>
            {statusOptions.map((option) => (
              <option key={`${option.value || "__all"}:${option.label}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </TableFiltersBar>
    </div>
  );
}
