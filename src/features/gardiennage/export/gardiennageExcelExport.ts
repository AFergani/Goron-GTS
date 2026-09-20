/**
 * Export Excel de la liste gardiennage (onglet Planification ou filtré).
 *
 * Colonnes métier uniquement (site, période, horaires, statut…) — pas d’UUID en export.
 * Fichier `gardiennage_export_<horodatage>.xlsx` enregistré via le dialogue natif.
 */

import * as XLSX from "xlsx";
import { downloadSheetJsWorkbook } from "../../common/utils/downloadSheetJsWorkbook";
import type { GardiennageEntry } from "../model/gardiennage.types";
import { statusLabelFr } from "./gardiennageExportFormat";
import { exportTimestampFrForFilename } from "../../common/utils/exportFilename";
import { formatDateShortFr } from "../../common/utils/formatDateShortFr";

const HEADERS = [
  "N°",
  "Site",
  "Période",
  "Horaires",
  "Prestataire",
  "Statut",
  "Notes",
  "Compte-rendu",
  "N° bon",
  "Intervention liée",
  "Ronde liée"
] as const;

function formatPeriod(entry: GardiennageEntry): string {
  const start = formatDateShortFr(entry.recurrenceStartDate);
  if (!start) return "";
  if (entry.isPonctuel) return start;
  if (!entry.recurrenceEndDate) return `${start} -> Jusqu'à nouvel ordre`;
  return `${start} -> ${formatDateShortFr(entry.recurrenceEndDate)}`;
}

function formatSchedule(entry: GardiennageEntry): string {
  if (!entry.startTime || !entry.endTime) return "";
  return entry.crossesMidnight ? `${entry.startTime} -> ${entry.endTime} (nuit)` : `${entry.startTime} -> ${entry.endTime}`;
}

/**
 * Exporte la liste gardiennage filtrée en Excel.
 *
 * @param entries - Lignes à exporter.
 * @returns Chemin enregistré, ou annulation utilisateur.
 */
export async function exportGardiennageToExcel(entries: GardiennageEntry[]) {
  const rows: string[][] = [
    [...HEADERS],
    ...entries.map((entry) => [
      entry.dailyCode || "",
      entry.siteDisplay || "",
      formatPeriod(entry),
      formatSchedule(entry),
      entry.intervenantName || "",
      statusLabelFr(entry.status),
      entry.notes || "",
      entry.closureReport || "",
      entry.workOrderNumber || "",
      entry.linkedInterventionId ? "Oui" : "Non",
      entry.linkedRondeId ? "Oui" : "Non"
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
    { wch: 34 },
    { wch: 30 },
    { wch: 20 },
    { wch: 24 },
    { wch: 14 },
    { wch: 42 },
    { wch: 42 },
    { wch: 16 },
    { wch: 18 },
    { wch: 14 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Gardiennage");
  return downloadSheetJsWorkbook(wb, `gardiennage_export_${exportTimestampFrForFilename()}.xlsx`);
}
