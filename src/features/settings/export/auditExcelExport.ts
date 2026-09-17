/**
 * Export Excel du journal d’actions (filtres appliqués côté page).
 */

import * as XLSX from "xlsx";
import { downloadSheetJsWorkbook } from "../../common/utils/downloadSheetJsWorkbook";
import { exportTimestampForFilename } from "../../common/utils/exportFilename";
import type { AuditLog } from "../../../types";

/**
 * Exporte le journal d’actions filtré en Excel.
 *
 * @param logs - Lignes à exporter.
 * @returns Chemin enregistré, ou annulation utilisateur.
 */
export async function exportAuditLogsToExcel(logs: AuditLog[]) {
  const headers = ["Date", "Acteur", "Action", "Cible", "Statut", "Détails JSON"];
  const rows: string[][] = [
    headers,
    ...logs.map((log) => [
      new Date(log.occurredAt).toLocaleString("fr-FR"),
      String(log.actorUsername || ""),
      String(log.action || ""),
      String(log.targetUsername || ""),
      String(log.status || ""),
      log.details ? JSON.stringify(log.details) : ""
    ])
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 21 }, { wch: 20 }, { wch: 34 }, { wch: 20 }, { wch: 12 }, { wch: 80 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Journal des actions");
  return downloadSheetJsWorkbook(wb, `journal-actions_${exportTimestampForFilename()}.xlsx`);
}
