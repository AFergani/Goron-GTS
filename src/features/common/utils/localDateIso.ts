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
