/**
 * Export Excel du journal main courante (résultat filtré côté page).
 */

import * as XLSX from "xlsx";
import type { MainCouranteEntry } from "../model/mainCourante.types";
import { exportTimestampForFilename, formatMainCouranteDate, statusLabelFr } from "./mainCouranteExportFormat";

const HEADERS = [
  "Date création",
  "Opérateur",
  "Responsable",
  "Site",
  "Type d'anomalie",
  "Information",
  "Observation responsable",
  "État",
  "Prise en compte",
  "Clôturé le"
] as const;

/**
 * Exporte les entrées (souvent filtrées) en classeur Excel avec colonnes dimensionnées.
 */
export function exportMainCouranteToExcel(entries: MainCouranteEntry[]): void {
  const rows: string[][] = [
    [...HEADERS],
    ...entries.map((e) => [
      formatMainCouranteDate(e.createdAt),
      e.operatorName,
      e.managerName || "",
      e.siteDisplay || "",
      e.anomalyTypeLabel,
      e.information,
      e.managerObservation || "",
      statusLabelFr(e.status),
      e.priseEnCompteAt ? formatMainCouranteDate(e.priseEnCompteAt) : "",
      e.closedAt ? formatMainCouranteDate(e.closedAt) : ""
    ])
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 32 },
    { wch: 18 },
    { wch: 50 },
    { wch: 50 },
    { wch: 14 },
    { wch: 18 },
    { wch: 18 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Main courante");
  const name = `main-courante_export_${exportTimestampForFilename()}.xlsx`;
  XLSX.writeFile(wb, name);
}
