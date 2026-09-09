/**
 * Helpers pour la synthèse mensuelle (cartes compteurs pages métier).
 *
 * Périmètre V1 : mois civil en cours, heure locale du poste.
 * Utilisé par : main courante, interventions, gardiennage.
 */

/**
 * Retourne la clé mois civil locale `YYYY-MM`.
 *
 * @param date - Instant de référence (défaut : maintenant)
 * @returns Clé mois au format `YYYY-MM`
 */
export function getLocalMonthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Libellé du mois en français (ex. « Août »).
 *
 * @param monthKey - Clé `YYYY-MM` (défaut : mois en cours)
 * @returns Nom du mois capitalisé
 */
function formatLocalMonthNameFr(monthKey: string = getLocalMonthKey()): string {
  const [year, monthPart] = monthKey.split("-").map((value) => Number(value));
  if (!year || !monthPart) return monthKey;
  const text = new Date(year, monthPart - 1, 1).toLocaleDateString("fr-FR", { month: "long" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Titre affiché au-dessus des cartes de synthèse (ex. « Synthèse du mois · Août »).
 *
 * @param monthKey - Clé `YYYY-MM` (défaut : mois en cours)
 * @returns Libellé complet pour l’interface
 */
export function getCurrentMonthSummaryTitle(monthKey: string = getLocalMonthKey()): string {
  return `Synthèse du mois · ${formatLocalMonthNameFr(monthKey)}`;
}

/**
 * Indique si une date ISO `YYYY-MM-DD` appartient au mois civil donné.
 *
 * @param isoDate - Date civile ISO
 * @param monthKey - Clé `YYYY-MM`
 * @returns Vrai si la date est dans le mois
 */
export function isIsoDateInLocalMonth(isoDate: string, monthKey: string): boolean {
  const trimmed = String(isoDate || "").trim();
  if (trimmed.length < 7) return false;
  return trimmed.slice(0, 7) === monthKey;
}

/**
 * Indique si un horodatage ISO appartient au mois civil local.
 *
 * @param isoTimestamp - Horodatage ISO (ex. `createdAt`)
 * @param monthKey - Clé `YYYY-MM`
 * @returns Vrai si l’instant tombe dans le mois local
 */
export function isTimestampInLocalMonth(isoTimestamp: string, monthKey: string): boolean {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) return false;
  return getLocalMonthKey(parsed) === monthKey;
}
