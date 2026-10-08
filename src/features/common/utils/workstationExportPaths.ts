/**
 * Clés et stockage local (poste) des derniers fichiers d’export Word/Excel.
 *
 * Pas de PostgreSQL : un chemin Windows n’est valable que sur la machine qui a enregistré.
 */

const STORAGE_KEY = "gts-last-export-paths-v1";

export const WORKSTATION_EXPORT_KEYS = {
  excelMainCourante: "excel:mainCourante",
  excelIntervention: "excel:intervention",
  excelGardiennage: "excel:gardiennage",
  excelRondeContractual: "excel:ronde:contractual",
  excelRondeExceptional: "excel:ronde:exceptional",
  excelAudit: "excel:audit",
  excelTechLogs: "excel:techLogs",
  /** Rapport Word PV vidéo : ouverture limitée à 20 s, comme un export Excel. */
  wordPvVideo: "quick:pvVideo"
} as const;

/**
 * Clé Word pour une fiche métier.
 *
 * @param domain - Module (main courante, intervention, ronde).
 * @param entryId - Identifiant interne de l’entrée (jamais affiché).
 */
export function wordExportKey(domain: "mainCourante" | "intervention" | "ronde", entryId: string): string {
  return `word:${domain}:${entryId}`;
}

/**
 * Nom de fichier seul (sans dossier) pour infobulle, jamais le chemin complet.
 *
 * @param filePath - Chemin absolu Windows ou POSIX.
 */
export function exportFileBasename(filePath: string): string {
  const normalized = String(filePath || "").replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || "rapport";
}

/**
 * @returns Carte clé → chemin, ou objet vide si absent / invalide.
 */
export function readStoredExportPaths(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof key === "string" && typeof value === "string" && value.trim()) {
        next[key] = value;
      }
    }
    return next;
  } catch {
    return {};
  }
}

/**
 * Persiste la carte des chemins d’export de ce poste.
 *
 * @param paths - Carte complète à écrire.
 */
export function writeStoredExportPaths(paths: Record<string, string>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(paths));
}
