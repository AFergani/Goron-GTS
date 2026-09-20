/**
 * Enregistrement d’un Blob d’export (Word / Excel) via le dialogue Electron.
 *
 * Remplace le téléchargement navigateur (`<a download>`) afin de connaître le chemin
 * réel du fichier et de pouvoir le rouvrir ensuite.
 */

import { gtsApiClient, type SaveExportFileResult } from "../../../infrastructure/api/gtsApiClient";
import { extractUserFacingErrorMessage } from "./extractUserFacingErrorMessage";

export type { SaveExportFileResult };

/**
 * Propose « Enregistrer sous » puis écrit le blob. Annulation utilisateur = `canceled: true`.
 *
 * @param blob - Contenu généré (docx / xlsx).
 * @param filename - Nom de fichier proposé (sans dossier).
 * @returns Chemin absolu si enregistré, ou annulation.
 */
export async function saveExportBlob(blob: Blob, filename: string): Promise<SaveExportFileResult> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const lower = filename.toLowerCase();
  const kind = lower.endsWith(".xlsx") ? "xlsx" : "docx";
  if (typeof window !== "undefined" && typeof window.gtsApi?.saveExportFile === "function") {
    try {
      return await gtsApiClient.saveExportFile({ defaultFileName: filename, kind, bytes });
    } catch (error) {
      throw new Error(extractUserFacingErrorMessage(error, "Impossible d'enregistrer le fichier."));
    }
  }
  fallbackBrowserDownload(blob, filename);
  return { canceled: false, filePath: null };
}

/**
 * Repli hors Electron (aperçu Vite isolé) : téléchargement navigateur, sans chemin connu.
 *
 * @param blob
 * @param filename
 */
function fallbackBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
