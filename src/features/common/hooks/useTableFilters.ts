import { useCallback, useState } from "react";

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
  reset: () => void;
};

/**
 * Gère l'état commun des filtres et de la pagination pour les tableaux.
 * - Remet la page à 1 dès qu'un filtre (recherche, dates) change.
 * - pageSize=0 = affichage illimité.
 * - Logique date : si dateTo est vide et dateFrom est renseigné,
 *   le consommateur doit traiter cela comme une égalité stricte sur dateFrom.
 */
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
    search, dateFrom, dateTo, currentPage, pageSize,
    setSearch, setDateFrom, setDateTo, setCurrentPage, setPageSize, reset,
  };
}
