/**
 * Enregistre un classeur SheetJS (xlsx) via le même canal que Word / ExcelJS (`saveExportBlob`).
 */

import type { WorkBook } from "xlsx";
import * as XLSX from "xlsx";
import { saveExportBlob, type SaveExportFileResult } from "./saveExportBlob";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** Hauteur de la ligne d'en-têtes des listes métier. */
const LIST_HEADER_ROW_HEIGHT_PT = 22;

/**
 * Classeur de liste : filtre automatique, en-têtes figés, largeurs de colonnes.
 *
 * @param sheetName - Nom de la feuille (31 caractères max).
 * @param rows - Première ligne = en-têtes, puis les données.
 * @param colWidths - Largeur de chaque colonne, en caractères.
 * @returns Classeur prêt pour `downloadSheetJsWorkbook`.
 */
export function buildFilteredListWorkbook(
  sheetName: string,
  rows: Array<Array<string | number>>,
  colWidths: number[]
): WorkBook {
  const columnCount = Math.max(colWidths.length, rows[0]?.length ?? 1);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: Math.max(0, rows.length - 1), c: columnCount - 1 }
    })
  };
  ws["!rows"] = [{ hpt: LIST_HEADER_ROW_HEIGHT_PT }];
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  ws["!cols"] = colWidths.map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  wb.Workbook = wb.Workbook || {};
  wb.Workbook.Views = [{ RTL: false }];
  return wb;
}

/**
 * Sérialise le workbook SheetJS puis ouvre le dialogue d’enregistrement.
 *
 * @param wb - Classeur SheetJS.
 * @param filename - Nom proposé (`.xlsx`).
 * @returns Résultat d’enregistrement (annulation possible).
 */
export async function downloadSheetJsWorkbook(wb: WorkBook, filename: string): Promise<SaveExportFileResult> {
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return saveExportBlob(new Blob([out], { type: XLSX_MIME }), filename);
}
