/**
 * Export Excel des listes ronde contractuelle ou exceptionnelle.
 */

import { buildFilteredListWorkbook, downloadSheetJsWorkbook } from "../../common/utils/downloadSheetJsWorkbook";
import type { RondeEntry } from "../model/ronde.types";
import { exportTimestampFrForFilename } from "../../common/utils/exportFilename";
import { formatDateShortFr } from "../../common/utils/formatDateShortFr";
import { rondeOriginLabelFr, rondeStatusLabelFr } from "./rondeExportFormat";
import { resolveKnownRondePassageKind } from "../utils/rondePassageKindLabel";

const HEADERS = [
  "N°",
  "Date demande",
  "Site",
  "Origine",
  "Prestataire",
  "Statut",
  "Type / horaires demandés / observation",
  "H arrivée",
  "H départ",
  "Durée (min)",
  "N° bon",
  "Compte-rendu"
] as const;

/**
 * Colonne type + horaires : le type de passage (ouverture, fermeture, etc.)
 * précède le texte déjà saisi, pour le contractuel comme pour l’exceptionnel.
 * Sans type identifiable, le texte reste seul (pas de repli « Aléatoire »).
 */
function horairesDemandeObsExportCell(entry: RondeEntry): string {
  const obs = String(entry.horairesDemandeObs || "").trim();
  const kind = (resolveKnownRondePassageKind(entry) ?? "").trim();
  if (!kind) return obs;
  if (obs.toLowerCase().includes(kind.toLowerCase())) return obs;
  return obs ? `${kind} — ${obs}` : kind;
}

/**
 * Exporte une liste ronde en Excel.
 *
 * @param entries - Lignes à exporter.
 * @param sheetName - Feuille contractuelle ou exceptionnelle.
 * @returns Chemin enregistré, ou annulation utilisateur.
 */
export async function exportRondeToExcel(
  entries: RondeEntry[],
  sheetName: "Ronde contractuelle" | "Ronde exceptionnelle"
) {
  const rows: Array<Array<string | number>> = [
    [...HEADERS],
    ...entries.map((entry) => [
      entry.dailyCode || "",
      formatDateShortFr(entry.requestDate) || "",
      entry.siteDisplay || "",
      rondeOriginLabelFr(entry),
      entry.intervenantName || "",
      rondeStatusLabelFr(entry),
      horairesDemandeObsExportCell(entry),
      entry.arrivalTime || "",
      entry.departureTime || "",
      entry.durationMinutes ?? "",
      entry.workOrderNumber || "",
      entry.report || ""
    ])
  ];

  const wb = buildFilteredListWorkbook(sheetName, rows, [14, 18, 34, 18, 24, 14, 46, 10, 10, 12, 14, 50]);
  const scope = sheetName === "Ronde contractuelle" ? "contractuelle" : "exceptionnelle";
  return downloadSheetJsWorkbook(wb, `ronde_${scope}_export_${exportTimestampFrForFilename()}.xlsx`);
}
