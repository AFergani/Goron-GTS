import { useMemo, useState } from "react";

/**
 * Tri client des lignes de tableau par colonne (comparateurs fournis par la vue).
 *
 * `sortedEntries` est recalculé quand `entries`, `sortKey`, `sortDirection` ou
 * `comparators` changent. `toggleSort` : sur la colonne active, alterne asc/desc ;
 * sur une nouvelle colonne, active cette clé en ascendant.
 *
 * Utilisé par : MainCouranteTable, InterventionTable, RondeTable, GardiennageTable,
 * onglets Gestion des données.
 */

type SortDirection = "asc" | "desc";

/** Comparateur numérique par clé de colonne (retour < 0, 0, > 0 comme `Array.sort`) */
type ComparatorMap<T, TKey extends string> = Record<TKey, (a: T, b: T) => number>;

export function useTableSort<T, TKey extends string>(
  entries: T[],
  comparators: ComparatorMap<T, TKey>,
  initialSort: { key: TKey; direction?: SortDirection }
) {
  const [sortKey, setSortKey] = useState<TKey>(initialSort.key);
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialSort.direction || "desc");

  const sortedEntries = useMemo(() => {
    const compare = comparators[sortKey];
    const sorted = [...entries].sort(compare);
    if (sortDirection === "desc") {
      sorted.reverse();
    }
    return sorted;
  }, [comparators, entries, sortDirection, sortKey]);

  const toggleSort = (key: TKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  return {
    sortedEntries,
    sortKey,
    sortDirection,
    toggleSort
  };
}
