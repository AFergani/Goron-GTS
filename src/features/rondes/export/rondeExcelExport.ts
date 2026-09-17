/**
 * Export Excel des listes ronde contractuelle ou exceptionnelle.
 */

import * as XLSX from "xlsx";
import { downloadSheetJsWorkbook } from "../../common/utils/downloadSheetJsWorkbook";
import type { RondeEntry } from "../model/ronde.types";
import { exportTimestampFrForFilename } from "../../common/utils/exportFilename";
import { formatDateShortFr } from "../../common/utils/formatDateShortFr";
import { rondeOriginLabelFr, rondeStatusLabelFr } from "./rondeExportFormat";

const HEADERS = [
  "N°",
  "Date demande",
  "Site",
  "Origine",
  "Prestataire",
  "Statut",
  "Horaires demandés / observation",
  "H arrivée",
  "H départ",
  "Durée (min)",
  "N° bon",
  "Compte-rendu"
] as const;

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
      entry.horairesDemandeObs || "",
      entry.arrivalTime || "",
      entry.departureTime || "",
      entry.durationMinutes ?? "",
      entry.workOrderNumber || "",
      entry.report || ""
    ])
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const tableRange = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(0, rows.length - 1), c: HEADERS.length - 1 }
  });
  ws["!autofilter"] = { ref: tableRange };
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  ws["!rows"] = [{ hpt: 22 }];
  ws["!cols"] = [
    { wch: 14 },
    { wch: 14 },
    { wch: 34 },
    { wch: 18 },
    { wch: 24 },
    { wch: 14 },
    { wch: 46 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 14 },
    { wch: 50 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const scope = sheetName === "Ronde contractuelle" ? "contractuelle" : "exceptionnelle";
  return downloadSheetJsWorkbook(wb, `ronde_${scope}_export_${exportTimestampFrForFilename()}.xlsx`);
}
