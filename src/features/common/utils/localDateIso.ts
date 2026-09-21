/**
 * Helpers de date locale (calendrier poste) pour filtres, navigation jour et badges « du jour ».
 *
 * Utilisé par Gardiennage, Rondes, Fransor, interventions et le shell (compteurs du jour).
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

/**
 * Décale une date calendaire locale `YYYY-MM-DD` de `amount` jours (sans UTC).
 *
 * @param iso - Date de départ
 * @param amount - Jours à ajouter (négatif pour reculer)
 * @returns Date locale ISO, ou chaîne vide si le format est invalide
 */
export function addDaysLocalIso(iso: string, amount: number): string {
  const [year, month, day] = String(iso || "").split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + amount);
  return getLocalDateIso(date);
}

/**
 * Libellé long français d’une date calendaire locale (`lundi 21 septembre 2026`).
 *
 * @param iso - Date `YYYY-MM-DD`
 * @returns Libellé, ou chaîne vide
 */
export function formatLongDateFr(iso: string): string {
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Date(year, month - 1, day).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
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
