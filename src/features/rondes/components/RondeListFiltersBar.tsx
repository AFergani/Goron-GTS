/**
 * Barre de filtres liste rondes (délègue au module partagé `ServiceListFiltersBar`).
 */

import {
  ServiceListFiltersBar,
  type ServiceListIntervenantOption,
  type ServiceListStatusOption
} from "../../common/components/ServiceListFiltersBar";

const RONDE_STATUS_OPTIONS: ServiceListStatusOption[] = [
  { value: "EN_COURS", label: "En cours" },
  { value: "", label: "Tous" },
  { value: "CLOTURE", label: "Clôturé" },
  { value: "ANNULE", label: "Annulé / Non effectuée" }
];

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
  intervenantOptions: ServiceListIntervenantOption[];
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
};

export function RondeListFiltersBar(props: RondeListFiltersBarProps) {
  return (
    <ServiceListFiltersBar
      {...props}
      searchPlaceholder="Site, prestataire, horaires demandés, compte rendu…"
      statusOptions={RONDE_STATUS_OPTIONS}
    />
  );
}
