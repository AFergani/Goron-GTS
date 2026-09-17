/**
 * Pagination client des tableaux métier (taille de page, navigation, haut de page).
 *
 * Tailles 25 / 50 / 100 / Illimité (`pageSize === 0` désactive la navigation page).
 * Changement de page (première / précédente / suivante / dernière) avec scroll fluide
 * vers le haut de la page (titre du shell, `.content`) ; bouton dédié ChevronsUp.
 * Compteur en français (« résultat(s) », « page x/y ») — masquable via `showCount={false}`.
 * `yearNav` remplace les chevrons de page par un sélecteur d’année (ex. jours fériés).
 */

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronsUp } from "lucide-react";
import { scrollPaginationTarget } from "../utils/scrollPaginationTarget";

type YearNavProps = {
  /** Année affichée (`YYYY`). */
  year: string;
  /** Met à jour l’année filtrée. */
  onYearChange: (year: string) => void;
  /** Borne basse (défaut 1900). */
  min?: number;
  /** Borne haute (défaut 2200). */
  max?: number;
};

type TablePaginationBarProps = {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  /** 0 = illimité (désactive la navigation page) */
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
  /** Si défini, les chevrons « page » deviennent un sélecteur d’année. */
  yearNav?: YearNavProps;
  /** Masque le libellé « X résultat(s) » / « page x/y ». */
  showCount?: boolean;
};

/**
 * Décale une année saisie, bornée à [min, max].
 *
 * @param year - Valeur courante.
 * @param delta - +1 / -1.
 * @param min - Année minimale.
 * @param max - Année maximale.
 * @returns Nouvelle année, ou la valeur d’origine si invalide.
 */
function shiftYearValue(year: string, delta: number, min: number, max: number) {
  const parsed = Number(year);
  if (!Number.isFinite(parsed)) return year;
  const next = parsed + delta;
  if (next < min || next > max) return year;
  return String(next);
}

export function TablePaginationBar({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  yearNav,
  showCount = true
}: TablePaginationBarProps) {
  const handlePageChange = (p: number) => {
    onPageChange(p);
    scrollPaginationTarget();
  };

  const countLabel =
    pageSize === 0 || yearNav
      ? `${totalItems} résultat(s)`
      : `${totalItems} résultat(s) — page ${currentPage}/${totalPages}`;

  const yearMin = yearNav?.min ?? 1900;
  const yearMax = yearNav?.max ?? 2200;

  return (
    <div className="pagination-row">
      <div className="row-actions" style={{ alignItems: "center", gap: 10 }}>
        <label className="pagination-page-size">
          Lignes
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label="Nombre de lignes par page"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={0}>Illimité</option>
          </select>
        </label>
        {showCount ? <span className="muted">{countLabel}</span> : null}
      </div>

      <div className="row-actions">
        {yearNav ? (
          <div className="pagination-year-nav">
            <button
              type="button"
              className="btn-light action-icon-btn"
              title="Année précédente"
              aria-label="Année précédente"
              onClick={() => yearNav.onYearChange(shiftYearValue(yearNav.year, -1, yearMin, yearMax))}
            >
              <ChevronLeft size={14} />
            </button>
            <input
              type="number"
              className="pagination-year-input"
              min={yearMin}
              max={yearMax}
              step={1}
              value={yearNav.year}
              onChange={(e) => yearNav.onYearChange(e.target.value)}
              aria-label="Année affichée"
            />
            <button
              type="button"
              className="btn-light action-icon-btn"
              title="Année suivante"
              aria-label="Année suivante"
              onClick={() => yearNav.onYearChange(shiftYearValue(yearNav.year, 1, yearMin, yearMax))}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="btn-light action-icon-btn"
              title="Première page"
              aria-label="Première page"
              onClick={() => handlePageChange(1)}
              disabled={currentPage <= 1 || pageSize === 0}
            >
              <ChevronsLeft size={14} />
            </button>
            <button
              type="button"
              className="btn-light action-icon-btn"
              title="Page précédente"
              aria-label="Page précédente"
              onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1 || pageSize === 0}
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              className="btn-light action-icon-btn"
              title="Page suivante"
              aria-label="Page suivante"
              onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage >= totalPages || pageSize === 0}
            >
              <ChevronRight size={14} />
            </button>
            <button
              type="button"
              className="btn-light action-icon-btn"
              title="Dernière page"
              aria-label="Dernière page"
              onClick={() => handlePageChange(totalPages)}
              disabled={currentPage >= totalPages || pageSize === 0}
            >
              <ChevronsRight size={14} />
            </button>
          </>
        )}
        <button
          type="button"
          className="btn-light action-icon-btn"
          title="Haut de page"
          aria-label="Haut de page"
          onClick={() => scrollPaginationTarget()}
        >
          <ChevronsUp size={14} />
        </button>
      </div>
    </div>
  );
}
