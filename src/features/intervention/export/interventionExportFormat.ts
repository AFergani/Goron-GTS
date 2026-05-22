/**
 * Helpers d’export partagés (horodatage fichier).
 *
 * Réutilisé par les exports Excel intervention, ronde, gardiennage.
 */

/** Horodatage `JJ-MM-AAAA_HHhMM` pour noms de fichiers exportés. */
export function exportTimestampFrForFilename(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = String(now.getFullYear());
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  return `${day}-${month}-${year}_${hour}h${minute}`;
}
