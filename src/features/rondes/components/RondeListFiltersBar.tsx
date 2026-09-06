/**
 * Barre de filtres liste rondes (recherche, dates, famille, prestataire, statut).
 */

import { TableFiltersBar } from "../../common/components/TableFiltersBar";

type RondeListFiltersBarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
  onReset: () => void;
  familyFilter: string;
  onFamilyFilterChange: (value: string) => void;
  familyOptions: string[];
  intervenantFilter: string;
  onIntervenantFilterChange: (value: string) => void;
  intervenantOptions: Array<{ id: string; name: string }>;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
};

export function RondeListFiltersBar({
  search,
  onSearchChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  onReset,
  familyFilter,
  onFamilyFilterChange,
  familyOptions,
  intervenantFilter,
  onIntervenantFilterChange,
  intervenantOptions,
  statusFilter,
  onStatusFilterChange
}: RondeListFiltersBarProps) {
  return (
    <div className="list-panel-filters">
      <TableFiltersBar
        search={search}
        onSearchChange={onSearchChange}
        dateFrom={dateFrom}
        onDateFromChange={onDateFromChange}
        dateTo={dateTo}
        onDateToChange={onDateToChange}
        searchPlaceholder="Site, prestataire, horaires demandés, compte rendu…"
        onReset={onReset}
      >
        <label>
          Famille
          <select value={familyFilter} onChange={(e) => onFamilyFilterChange(e.target.value)}>
            <option value="">Toutes</option>
            {familyOptions.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label>
          Prestataire
          <select value={intervenantFilter} onChange={(e) => onIntervenantFilterChange(e.target.value)}>
            <option value="">Tous</option>
            {intervenantOptions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Statut
          <select value={statusFilter} onChange={(e) => onStatusFilterChange(e.target.value)}>
            <option value="EN_COURS">En cours</option>
            <option value="">Tous</option>
            <option value="CLOTURE">Clôturé</option>
            <option value="ANNULE">Annulé / Non effectuée</option>
          </select>
        </label>
      </TableFiltersBar>
    </div>
  );
}
