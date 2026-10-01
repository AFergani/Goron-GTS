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
import { formatDateShortFr, formatDateTimeFr } from "../../common/utils/formatDateShortFr";

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

function shiftIsoDate(dateIso: string, days: number): string {
  const base = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(base.getTime())) return dateIso;
  base.setDate(base.getDate() + days);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
}

function formatSlotStamp(iso: string): string {
  const raw = String(iso || "").trim();
  if (!raw.includes("T") && !raw.includes(" ")) return "";
  return formatDateTimeFr(raw);
}

/** Horaires avec les dates, y compris quand le départ est le lendemain. */
function formatSchedule(entry: GardiennageEntry): string {
  const startStamp = formatSlotStamp(entry.planningSlotStart || "");
  const endStamp = formatSlotStamp(entry.planningSlotEnd || "");
  if (startStamp && endStamp) return `${startStamp} -> ${endStamp}`;
  if (!entry.startTime || !entry.endTime) return "";
  const startDate = String(entry.recurrenceStartDate || "").trim();
  const overnight = Boolean(entry.crossesMidnight) || entry.endTime < entry.startTime;
  const endDate = overnight ? shiftIsoDate(startDate, 1) : startDate;
  const startLabel = formatDateShortFr(startDate);
  const endLabel = formatDateShortFr(endDate);
  if (!startLabel) return `${entry.startTime} -> ${entry.endTime}`;
  return `${startLabel} ${entry.startTime} -> ${endLabel || startLabel} ${entry.endTime}`;
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

  const wb = buildFilteredListWorkbook("Gardiennage", rows, [14, 34, 30, 42, 24, 28, 14, 42, 42, 16, 18, 14]);
  return downloadSheetJsWorkbook(wb, `gardiennage_export_${exportTimestampFrForFilename()}.xlsx`);
}
