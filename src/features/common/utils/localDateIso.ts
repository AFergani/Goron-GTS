/**
 * Helpers de date locale (calendrier poste) pour filtres et badges « du jour ».
 */

/**
 * Retourne une date au format ISO `YYYY-MM-DD` en heure locale (sans décalage UTC).
 *
 * @param date - Instant à formater (défaut : maintenant)
 * @returns Date locale au format ISO
 */
export function getLocalDateIso(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getLocalTimeHm(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** Découpe un ISO en date + heure locales pour les pickers. */
export function splitIsoToLocalDateTime(iso: string | null | undefined): { date: string; time: string } {
  const trimmed = String(iso || "").trim();
  if (!trimmed) return { date: "", time: "" };
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return { date: "", time: "" };
  return { date: getLocalDateIso(parsed), time: getLocalTimeHm(parsed) };
}
