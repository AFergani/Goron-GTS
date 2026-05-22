/**
 * Export Excel du journal d’actions (filtres appliqués côté page).
 */

import * as XLSX from "xlsx";
import type { AuditLog } from "../../../types";

function exportTimestampForFilename() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${min}`;
}

export function exportAuditLogsToExcel(logs: AuditLog[]) {
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
  XLSX.writeFile(wb, `journal-actions_${exportTimestampForFilename()}.xlsx`);
}
