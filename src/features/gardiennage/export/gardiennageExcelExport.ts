/**
 * Export Excel de la liste gardiennage (onglet Planification ou filtré).
 *
 * Colonnes métier uniquement (site, période, horaires, statut…) — pas d’UUID en export.
 * Fichier `gardiennage_export_<horodatage>.xlsx` enregistré via le dialogue natif.
 */

import { buildFilteredListWorkbook, downloadSheetJsWorkbook } from "../../common/utils/downloadSheetJsWorkbook";
import { gardiennageDemandLabel, type GardiennageEntry } from "../model/gardiennage.types";
import { statusLabelFr } from "./gardiennageExportFormat";
import { exportTimestampFrForFilename } from "../../common/utils/exportFilename";
import { formatDateShortFr } from "../../common/utils/formatDateShortFr";

const HEADERS = [
  "N°",
  "Site",
  "Période",
  "Horaires",
  "Prestataire",
  "Demande",
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
      gardiennageDemandLabel(entry.planningSnapshot?.clientName),
      statusLabelFr(entry.status),
      entry.notes || "",
      entry.closureReport || "",
      entry.workOrderNumber || "",
      entry.linkedInterventionId ? "Oui" : "Non",
      entry.linkedRondeId ? "Oui" : "Non"
    ])
  ];

  const wb = buildFilteredListWorkbook("Gardiennage", rows, [14, 34, 30, 20, 24, 28, 14, 42, 42, 16, 18, 14]);
  return downloadSheetJsWorkbook(wb, `gardiennage_export_${exportTimestampFrForFilename()}.xlsx`);
}
