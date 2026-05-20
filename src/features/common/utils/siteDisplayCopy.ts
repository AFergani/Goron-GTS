/** Extrait le code site lorsque le libellé affiché est du type « Nom (CODE) ». */
export function extractSiteCode(siteDisplay: string): string {
  const match = siteDisplay.match(/\(([^()]+)\)/);
  return match?.[1]?.trim() ?? "";
}

export async function copySiteDisplayCode(siteDisplay: string, onNotify?: (message: string) => void): Promise<void> {
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
