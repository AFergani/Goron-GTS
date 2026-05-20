import { useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";

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
