/**
 * Enregistre un classeur SheetJS (xlsx) via le même canal que Word / ExcelJS (`saveExportBlob`).
 */

import type { WorkBook } from "xlsx";
import * as XLSX from "xlsx";
import { saveExportBlob, type SaveExportFileResult } from "./saveExportBlob";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

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
