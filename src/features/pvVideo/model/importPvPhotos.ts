/**
 * Répartit un lot de photos PV selon le nom de fichier.
 *
 * `01.jpg` va sur la ligne 1, `02.jpg` sur la ligne 2. `global.jpg` (ou `globale`)
 * est la capture globale. Le reste est ignoré.
 */

import { MAX_PV_CAMERAS } from "./pvVideoForm";

export type PvPhotoImportPlan<T extends { name: string }> = {
  /** Photos de caméras, numéro de ligne de 1 à 80, sans doublon. */
  cameras: Array<{ number: number; file: T }>;
  /** Fichier de la capture globale, s'il est nommé global ou globale. */
  globalFile: T | null;
  /** Noms laissés de côté : format inattendu, doublon ou numéro hors limite. */
  skipped: string[];
};

/**
 * Nom de fichier sans dossier ni extension, en minuscules.
 *
 * @param fileName - Nom tel que fourni par le sélecteur.
 */
function fileStem(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  const stem = (dot > 0 ? base.slice(0, dot) : base).trim().toLocaleLowerCase("fr-FR");
  return stem.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Classe chaque fichier du lot. Le premier fichier d'un numéro ou de la globale est gardé.
 *
 * @param files - Photos choisies ensemble.
 */
export function planPvPhotoImport<T extends { name: string }>(files: T[]): PvPhotoImportPlan<T> {
  const cameras = new Map<number, T>();
  let globalFile: T | null = null;
  const skipped: string[] = [];

  for (const file of files) {
    if (!/\.(png|jpe?g)$/i.test(file.name)) {
      skipped.push(file.name);
      continue;
    }
    const stem = fileStem(file.name);
    if (stem === "global" || stem === "globale") {
      if (globalFile) skipped.push(file.name);
      else globalFile = file;
      continue;
    }
    const match = stem.match(/^0*(\d+)(?:[-_ ].*)?$/);
    const number = match ? Number(match[1]) : 0;
    if (!match || number < 1 || number > MAX_PV_CAMERAS || cameras.has(number)) {
      skipped.push(file.name);
      continue;
    }
    cameras.set(number, file);
  }

  return {
    cameras: [...cameras.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([number, file]) => ({ number, file })),
    globalFile,
    skipped
  };
}

/**
 * Liste courte de noms de fichiers pour un message.
 *
 * @param names - Fichiers concernés.
 */
function joinFileNames(names: string[]): string {
  if (names.length <= 3) return names.join(", ");
  const rest = names.length - 3;
  return `${names.slice(0, 3).join(", ")} et ${rest} autre${rest > 1 ? "s" : ""}`;
}

/**
 * Message après un import de photos.
 *
 * @param placedCameras - Photos de caméras réellement posées.
 * @param globalPlaced - La capture globale a été remplie.
 * @param skipped - Fichiers au nom inattendu ou en doublon.
 * @param failed - Fichiers reconnus mais illisibles.
 */
export function describePvPhotoImport(
  placedCameras: number,
  globalPlaced: boolean,
  skipped: string[],
  failed: string[]
): { message: string; variant: "success" | "warning" } {
  if (!placedCameras && !globalPlaced) {
    return {
      message: "Aucune photo reconnue. Nommez-les 01, 02… et global.",
      variant: "warning"
    };
  }
  const placed = [
    placedCameras
      ? `${placedCameras} photo${placedCameras > 1 ? "s" : ""} de caméra${placedCameras > 1 ? "s" : ""} rangée${placedCameras > 1 ? "s" : ""}`
      : "",
    globalPlaced ? "capture globale en place" : ""
  ]
    .filter(Boolean)
    .join(", ");
  const notes = [
    skipped.length ? `${skipped.length > 1 ? "Ignorés" : "Ignoré"} : ${joinFileNames(skipped)}` : "",
    failed.length ? `${failed.length > 1 ? "Illisibles" : "Illisible"} : ${joinFileNames(failed)}` : ""
  ].filter(Boolean);
  if (!notes.length) {
    return { message: `${placed}. Les noms déjà saisis sont conservés.`, variant: "success" };
  }
  return { message: `${placed}. ${notes.join(". ")}.`, variant: "warning" };
}
