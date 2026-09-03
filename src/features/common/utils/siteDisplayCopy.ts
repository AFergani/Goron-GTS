/**
 * Copie du code site à partir du libellé affiché « Nom (CODE) ».
 *
 * Convention projet : le code métier est entre parenthèses dans `siteDisplay`, sans
 * exposer d’identifiant technique (UUID) à l’utilisateur. Notifications optionnelles
 * via `onNotify` (toast AppShell).
 *
 * Utilisé par : `SiteDisplayCopyButton`, `SiteSearchInput` (main courante), exports.
 */

import type { NotifyToast } from "../model/toast.types";

/** Déduit nom affiché et code entre parenthèses depuis un libellé « Nom (CODE) ». */
export function splitSiteDisplayParts(siteDisplay: string): { namePart: string; codePart: string } {
  const raw = String(siteDisplay || "").trim();
  const m = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) return { namePart: m[1].trim(), codePart: m[2].trim() };
  return { namePart: raw, codePart: "" };
}

/**
 * Extrait le code site lorsque le libellé est du type « Nom (CODE) »
 * (paire de parenthèses en fin de libellé).
 */
function extractSiteCode(siteDisplay: string): string {
  return splitSiteDisplayParts(siteDisplay).codePart;
}

/** Copie le code extrait dans le presse-papiers ; messages d’erreur ou de succès via `onNotify` */
export async function copySiteDisplayCode(
  siteDisplay: string,
  onNotify?: NotifyToast
): Promise<void> {
  const code = extractSiteCode(siteDisplay);
  if (!code) {
    onNotify?.("Aucun code site détecté entre parenthèses.", "warning");
    return;
  }
  try {
    await navigator.clipboard.writeText(code);
    onNotify?.(`Code site copié : ${code}`, "success");
  } catch {
    onNotify?.("Copie impossible.", "error");
  }
}
