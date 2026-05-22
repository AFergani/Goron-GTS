import { useCallback, useState } from "react";

/**
 * État partagé recherche, plage de dates et pagination pour listes tabulaires.
 *
 * Les setters de filtre (`setSearch`, `setDateFrom`, `setDateTo`, `setPageSize`)
 * remettent `currentPage` à 1. `pageSize === 0` signifie « tout afficher » (une page
 * logique côté consommateur). Si `dateTo` est vide et `dateFrom` renseigné, les pages
 * filtrent en général sur la date du jour `dateFrom` uniquement (`effectiveDateTo =
 * dateTo || dateFrom`).
 *
 * Couplé à `TableFiltersBar` et `TablePaginationBar` dans les vues métier.
 *
 * Utilisé par : MainCourantePage, InterventionPage, RondePage, GardiennagePage
 * (onglet planification), RondeProfilesManageTab.
 */

/** API exposée aux pages et barres de filtres */
export type UseTableFiltersReturn = {
  search: string;
  dateFrom: string;
  dateTo: string;
  currentPage: number;
  pageSize: number;
  setSearch: (v: string) => void;
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  setPageSize: (s: number) => void;
  /** Réinitialise recherche et dates ; page 1 ; conserve `pageSize` */
  reset: () => void;
};

export function useTableFilters(initial?: { pageSize?: number }): UseTableFiltersReturn {
  const [search, setSearchState] = useState("");
  const [dateFrom, setDateFromState] = useState("");
  const [dateTo, setDateToState] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initial?.pageSize ?? 25);

  const setSearch = useCallback((v: string) => {
    setSearchState(v);
    setCurrentPage(1);
  }, []);

  const setDateFrom = useCallback((v: string) => {
    setDateFromState(v);
    setCurrentPage(1);
  }, []);

  const setDateTo = useCallback((v: string) => {
    setDateToState(v);
    setCurrentPage(1);
  }, []);

  const setPageSize = useCallback((s: number) => {
    setPageSizeState(s);
    setCurrentPage(1);
  }, []);

  const reset = useCallback(() => {
    setSearchState("");
    setDateFromState("");
    setDateToState("");
    setCurrentPage(1);
  }, []);

  return {
    search,
    dateFrom,
    dateTo,
    currentPage,
    pageSize,
    setSearch,
    setDateFrom,
    setDateTo,
    setCurrentPage,
    setPageSize,
    reset
  };
}
