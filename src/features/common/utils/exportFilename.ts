/**
 * Segments de noms de fichiers pour exports (Word, Excel, etc.).
 */

/** Segment sans caractères interdits Windows. */
export function safeExportFilenamePart(s: string): string {
  const t = s.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").trim();
  return t.slice(0, 48) || "entree";
}

/** Horodatage UTC compact pour suffixe de fichier (`2026-09-03-12-26-00`). */
export function exportTimestampForFilename(): string {
  return new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
}

/** Horodatage local `JJ-MM-AAAA_HHhMM` (intervention, ronde, gardiennage). */
export function exportTimestampFrForFilename(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = String(now.getFullYear());
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  return `${day}-${month}-${year}_${hour}h${minute}`;
}
