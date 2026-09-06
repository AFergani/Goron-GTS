/**
 * Format date court français (calendaire ISO → JJ/MM/AAAA).
 *
 * Utilisé par exports Word et libellés UI (intervention, rondes, récaps).
 * Les champs `<input type="date">` restent en ISO AAAA-MM-JJ en valeur interne.
 */

/** Date calendaire ISO (AAAA-MM-JJ) → JJ/MM/AAAA ; chaîne vide si invalide. */
export function formatDateShortFr(dateIso: string): string {
  if (!dateIso) return "";
  const trimmed = String(dateIso).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const parsed = new Date(`${trimmed}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = String(parsed.getFullYear());
  return `${day}/${month}/${year}`;
}
