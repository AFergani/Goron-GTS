/**
 * Export Excel des listes ronde contractuelle ou exceptionnelle.
 */

import * as XLSX from "xlsx";
import { downloadSheetJsWorkbook } from "../../common/utils/downloadSheetJsWorkbook";
import type { RondeEntry } from "../model/ronde.types";
import { exportTimestampFrForFilename } from "../../common/utils/exportFilename";

const HEADERS = [
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

function formatDateFr(dateIso: string): string {
  if (!dateIso) return "";
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function statusLabel(status: RondeEntry["status"]): string {
  if (status === "CLOTURE") return "Clôturé";
  if (status === "ANNULE") return "Annulé";
  return "En cours";
}

function originLabel(entry: RondeEntry): string {
  if (entry.source === "PLANIFIE") return "Planifiée";
  if (entry.originKind === "TELESURVEILLANCE") return "Télésurveillance";
  if (entry.originKind === "CLIENT") return "Client";
  return "Autre";
}

export function exportRondeToExcel(entries: RondeEntry[], sheetName: "Ronde contractuelle" | "Ronde exceptionnelle"): void {
  const rows: Array<Array<string | number>> = [
    [...HEADERS],
    ...entries.map((entry) => [
      formatDateFr(entry.requestDate),
      entry.siteDisplay || "",
      originLabel(entry),
      entry.intervenantName || "",
      statusLabel(entry.status),
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
  downloadSheetJsWorkbook(wb, `ronde_${scope}_export_${exportTimestampFrForFilename()}.xlsx`);
}
