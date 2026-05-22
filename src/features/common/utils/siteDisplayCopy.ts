/**
 * Copie du code site à partir du libellé affiché « Nom (CODE) ».
 *
 * Convention projet : le code métier est entre parenthèses dans `siteDisplay`, sans
 * exposer d’identifiant technique (UUID) à l’utilisateur. Notifications optionnelles
 * via `onNotify` (toast AppShell).
 *
 * Utilisé par : `SiteDisplayCopyButton`, `SiteSearchInput` (main courante).
 */

/**
 * Extrait le code site lorsque le libellé est du type « Nom (CODE) »
 * (dernière paire de parenthèses).
 */
export function extractSiteCode(siteDisplay: string): string {
  const match = siteDisplay.match(/\(([^()]+)\)/);
  return match?.[1]?.trim() ?? "";
}

/** Copie le code extrait dans le presse-papiers ; messages d’erreur ou de succès via `onNotify` */
export async function copySiteDisplayCode(
  siteDisplay: string,
  onNotify?: (message: string) => void
): Promise<void> {
  const code = extractSiteCode(siteDisplay);
  if (!code) {
    onNotify?.("Aucun code site détecté entre parenthèses.");
    return;
  }
  try {
    await navigator.clipboard.writeText(code);
    onNotify?.(`Code site copié : ${code}`);
  } catch {
    onNotify?.("Copie impossible.");
  }
}
