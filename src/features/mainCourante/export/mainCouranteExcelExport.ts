/**
 * Export Excel du journal main courante (résultat filtré côté page).
 *
 * Utilise `exceljs` pour le support du retour à la ligne automatique
 * (`wrapText`) dans les cellules texte long (Information, Observation).
 */

import ExcelJS from "exceljs";
import type { MainCouranteEntry } from "../model/mainCourante.types";
import { downloadBlob } from "./downloadBlob";
import { exportTimestampForFilename, formatMainCouranteDate, statusLabelFr } from "./mainCouranteExportFormat";

/** Colonnes avec largeur et activation éventuelle du retour à la ligne. */
const COLUMNS: Array<{ header: string; key: string; width: number; wrap?: boolean }> = [
  { header: "Date création", key: "createdAt", width: 20 },
  { header: "Opérateur", key: "operator", width: 18 },
  { header: "Responsable", key: "manager", width: 18 },
  { header: "Site", key: "site", width: 34 },
  { header: "Type d'anomalie", key: "anomaly", width: 20 },
  { header: "Information", key: "information", width: 50, wrap: true },
  { header: "Observation responsable", key: "observation", width: 50, wrap: true },
  { header: "État", key: "status", width: 14 },
  { header: "Prise en compte", key: "priseEnCompte", width: 20 },
  { header: "Clôturé le", key: "closedAt", width: 20 }
];

const WRAP_KEYS = new Set(COLUMNS.filter((c) => c.wrap).map((c) => c.key));

/**
 * Exporte les entrées (souvent filtrées) en classeur Excel avec colonnes
 * dimensionnées et retour à la ligne automatique sur les champs texte long.
 */
export async function exportMainCouranteToExcel(entries: MainCouranteEntry[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Main courante");

  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  const baseAlignment: Partial<ExcelJS.Alignment> = { vertical: "middle", horizontal: "left" };

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { ...baseAlignment };

  for (const e of entries) {
    const row = ws.addRow({
      createdAt: formatMainCouranteDate(e.createdAt),
      operator: e.operatorName,
      manager: e.managerName || "",
      site: e.siteDisplay || "",
      anomaly: e.anomalyTypeLabel,
      information: normalizeNewlines(e.information),
      observation: normalizeNewlines(e.managerObservation || ""),
      status: statusLabelFr(e.status),
      priseEnCompte: e.priseEnCompteAt ? formatMainCouranteDate(e.priseEnCompteAt) : "",
      closedAt: e.closedAt ? formatMainCouranteDate(e.closedAt) : ""
    });
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const col = COLUMNS[colNumber - 1];
      cell.alignment = col && WRAP_KEYS.has(col.key)
        ? { ...baseAlignment, wrapText: true }
        : { ...baseAlignment };
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const name = `main-courante_export_${exportTimestampForFilename()}.xlsx`;
  downloadBlob(blob, name);
}

/** Normalise les retours à la ligne pour Excel (\r\n → \n). */
function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
