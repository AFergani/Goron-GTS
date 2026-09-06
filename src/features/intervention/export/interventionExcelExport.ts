/**
 * Export Excel de la liste interventions filtrée (colonnes métier, pas d’UUID).
 */

import { downloadSheetJsWorkbook } from "../../common/utils/downloadSheetJsWorkbook";
import { exportTimestampFrForFilename } from "../../common/utils/exportFilename";
import * as XLSX from "xlsx";
import {
  INTERVENTION_NO_WORK_ORDER_LABEL,
  type InterventionEntry
} from "../model/intervention.types";
import {
  billingLabelFr,
  formatInterventionDateTime,
  statusLabelFr
} from "./interventionExportFormat";

const HEADERS = [
  "Date / Demande",
  "Clients (Code site)",
  "Motif de la demande d'inter",
  "Prestataire",
  "H arrivee",
  "H depart",
  "Delai d'inter (min)",
  "N deg bon inter",
  "Compte-rendu",
  "Etat",
  "Facturation"
] as const;

export function exportInterventionToExcel(entries: InterventionEntry[]): void {
  const rows: Array<Array<string | number>> = [
    [...HEADERS],
    ...entries.map((entry) => [
      formatInterventionDateTime(entry.requestDate, entry.requestTime),
      entry.siteDisplay || "",
      entry.requestReason || "",
      entry.intervenantName || "",
      entry.arrivalTime || "",
      entry.departureTime || "",
      entry.delayMinutes ?? "",
      entry.workOrderNumber || INTERVENTION_NO_WORK_ORDER_LABEL,
      entry.report || "",
      statusLabelFr(entry.status),
      billingLabelFr(entry.billingStatus)
    ])
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const tableRange = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(0, rows.length - 1), c: HEADERS.length - 1 }
  });

  // Rendu "tableur" : filtres auto + vue initiale lisible.
  ws["!autofilter"] = { ref: tableRange };
  ws["!rows"] = [{ hpt: 22 }];
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };

  ws["!cols"] = [
    { wch: 20 },
    { wch: 36 },
    { wch: 45 },
    { wch: 24 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 18 },
    { wch: 50 },
    { wch: 14 },
    { wch: 16 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Intervention");
  wb.Workbook = wb.Workbook || {};
  wb.Workbook.Views = [{ RTL: false }];
  downloadSheetJsWorkbook(wb, `intervention_export_${exportTimestampFrForFilename()}.xlsx`);
}
