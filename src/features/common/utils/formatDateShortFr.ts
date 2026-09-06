/**
 * Format date court français (calendaire ISO → JJ-MM-AAAA).
 *
 * Utilisé par exports Word et libellés de modales (intervention, rondes).
 */

/** Date calendaire ISO (AAAA-MM-JJ) → JJ-MM-AAAA ; chaîne vide si invalide. */
export function formatDateShortFr(dateIso: string): string {
  if (!dateIso) return "";
  const parsed = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = String(parsed.getFullYear());
  return `${day}-${month}-${year}`;
}
