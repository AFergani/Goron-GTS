/**
 * Barre de filtres standard des listes métier (recherche, période, reset, filtres additionnels).
 *
 * Ligne 1 : recherche texte, dates Du/Au, bouton icône `RotateCcw` (réinitialiser).
 * Ligne 2 optionnelle (`children`) : selects spécifiques à la page (statut, site, etc.).
 * À placer dans un `<section className="panel">` sur chaque page liste.
 */

import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { DateInput } from "./DateInput";

type TableFiltersBarProps = {
  search: string;
  onSearchChange: (v: string) => void;
  dateFrom: string;
  onDateFromChange: (v: string) => void;
  dateTo: string;
  onDateToChange: (v: string) => void;
  onReset: () => void;
  /** Placeholder du champ de recherche texte libre */
  searchPlaceholder?: string;
  /** Ligne 2 : filtres spécifiques à la page (selects, etc.) */
  children?: ReactNode;
};

export function TableFiltersBar({
  search,
  onSearchChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  onReset,
  searchPlaceholder = "Rechercher…",
  children
}: TableFiltersBarProps) {
  return (
    <>
      <div className="intervention-filters-head">
        <div className="main-log-filters intervention-filters-head-left">
          <label className="main-log-search-wide">
            Recherche
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
            />
          </label>
          <div className="main-log-filters-date-range" role="group" aria-label="Période">
            <label className="main-log-filter-field--date">
              Du
              <DateInput value={dateFrom} onChange={(e) => onDateFromChange(e.target.value)} />
            </label>
            <label className="main-log-filter-field--date">
              Au
              <DateInput
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => onDateToChange(e.target.value)}
              />
            </label>
          </div>
        </div>
        <div className="main-log-filters-reset intervention-filters-reset-wrap">
          <button
            type="button"
            className="main-log-reset-btn action-icon-btn"
            title="Réinitialiser les filtres"
            aria-label="Réinitialiser les filtres"
            onClick={onReset}
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {children ? (
        <div className="main-log-filters intervention-filters-row" style={{ marginTop: 12 }}>
          {children}
        </div>
      ) : null}
    </>
  );
}
