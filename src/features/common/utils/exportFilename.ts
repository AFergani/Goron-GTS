/**
 * Segments de noms de fichiers pour exports (Word, Excel, etc.).
 */

/** Segment sans caractères interdits Windows. */
export function safeExportFilenamePart(s: string): string {
  const t = s.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").trim();
  return t.slice(0, 48) || "entree";
}

/**
 * Nom d’un rapport Word par fiche : préfixe + site + numéro métier `JJMMAAAA-XX`.
 * Le numéro évite d’écraser un autre rapport du même jour / même site.
 *
 * @param prefix - Préfixe métier (`Ronde`, `Intervention`, `main-courante`).
 * @param dailyCode - Numéro de fiche, ou vide (repli `sans-numero`).
 * @param siteDisplay - Libellé site affiché.
 */
export function ficheWordExportFilename(
  prefix: string,
  dailyCode: string | null | undefined,
  siteDisplay?: string | null
): string {
  const site = safeExportFilenamePart(String(siteDisplay || "").trim() || prefix);
  const code = String(dailyCode || "").trim();
  const codePart = safeExportFilenamePart(code || "sans-numero");
  return `${prefix}_${site}_${codePart}.docx`;
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
