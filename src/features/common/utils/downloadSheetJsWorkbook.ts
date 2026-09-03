/**
 * Télécharge un classeur SheetJS (xlsx) via le même canal que Word / ExcelJS (`downloadBlob`).
 */

import type { WorkBook } from "xlsx";
import * as XLSX from "xlsx";
import { downloadBlob } from "./downloadBlob";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Sérialise le workbook SheetJS puis déclenche le téléchargement navigateur. */
export function downloadSheetJsWorkbook(wb: WorkBook, filename: string): void {
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  downloadBlob(new Blob([out], { type: XLSX_MIME }), filename);
}
