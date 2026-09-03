/**
 * Pagination client des tableaux métier (taille de page, navigation, haut de page).
 *
 * Tailles 25 / 50 / 100 / Illimité (`pageSize === 0` désactive prev/next).
 * Changement de page avec scroll fluide vers le haut ; bouton dédié ChevronsUp.
 * Compteur en français (« résultat(s) », « page x/y »).
 */

import { ChevronLeft, ChevronRight, ChevronsUp } from "lucide-react";
import type { RefObject } from "react";
import { scrollPaginationTarget } from "../utils/scrollPaginationTarget";

type TablePaginationBarProps = {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  /** 0 = illimité (désactive la navigation page) */
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
  /** Cible de scroll (ex. barre d’outils du panneau) ; défaut = haut de fenêtre */
  scrollTargetRef?: RefObject<HTMLElement | null>;
};

export function TablePaginationBar({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  scrollTargetRef
}: TablePaginationBarProps) {
  const handlePageChange = (p: number) => {
    onPageChange(p);
    scrollPaginationTarget(scrollTargetRef);
  };

  const countLabel =
    pageSize === 0
      ? `${totalItems} résultat(s)`
      : `${totalItems} résultat(s) — page ${currentPage}/${totalPages}`;

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
        <span className="muted">{countLabel}</span>
      </div>

      <div className="row-actions">
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
          title="Haut de page"
          aria-label="Haut de page"
          onClick={() => scrollPaginationTarget(scrollTargetRef)}
        >
          <ChevronsUp size={14} />
        </button>
      </div>
    </div>
  );
}
