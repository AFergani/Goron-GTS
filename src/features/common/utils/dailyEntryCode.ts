/**
 * Numéro métier journalier `JJMMAAAA-XX` (affichage, recherche). L’UUID reste interne.
 */

/**
 * Ajoute ` N°JJMMAAAA-XX` au titre d’une fiche déjà numérotée.
 *
 * @param baseTitle - Titre métier (ex. Rapport d'intervention).
 * @param dailyCode - Code attribué, ou vide en création / fiche virtuelle.
 * @returns Titre avec numéro, ou le titre seul.
 */
export function reportTitleWithDailyCode(baseTitle: string, dailyCode?: string | null): string {
  const code = String(dailyCode || "").trim();
  return code ? `${baseTitle} N°${code}` : baseTitle;
}

/**
 * Correspondance recherche : `16092026-01`, `16/09/2026-01`, ou le préfixe jour `16092026`.
 *
 * @param dailyCode - Code stocké.
 * @param query - Saisie utilisateur.
 * @returns Vrai si le numéro correspond à la recherche.
 */
export function matchesDailyCodeSearch(dailyCode: string | null | undefined, query: string): boolean {
  const code = String(dailyCode || "").trim().toLowerCase();
  const q = query.trim().toLowerCase();
  if (!code || !q) return false;
  if (code.includes(q)) return true;
  const compactCode = code.replace(/[^0-9]/g, "");
  const compactQuery = q.replace(/[^\d]/g, "");
  if (compactQuery.length < 6) return false;
  return compactCode.includes(compactQuery);
}
