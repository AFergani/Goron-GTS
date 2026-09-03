/**
 * Types partagés des onglets « Gestion des données » (suppression avec motif).
 */

export type SyncOrAsync = void | Promise<void>;

export type OpenDeleteReasonModal = (
  targetLabel: string,
  callback: (reason: string) => SyncOrAsync
) => void;

/** Comparaison texte FR (alphanumérique naturel, ex. A2 < A10). */
export function compareTextFr(a: string | null | undefined, b: string | null | undefined): number {
  return String(a || "").localeCompare(String(b || ""), "fr", { numeric: true, sensitivity: "base" });
}

/** Flèche de tri colonne (↕ inactif, ↑ asc, ↓ desc) — même convention que les tableaux métier. */
export function tableSortArrow(
  activeKey: string,
  columnKey: string,
  direction: "asc" | "desc"
): string {
  return activeKey === columnKey ? (direction === "asc" ? "↑" : "↓") : "↕";
}
