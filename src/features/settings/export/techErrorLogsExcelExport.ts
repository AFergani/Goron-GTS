/**
 * Export Excel des logs techniques (onglet Journal des actions).
 */

import * as XLSX from "xlsx";
import { downloadSheetJsWorkbook } from "../../common/utils/downloadSheetJsWorkbook";
import { exportTimestampForFilename } from "../../common/utils/exportFilename";
import { formatDateTimeFr } from "../../common/utils/formatDateShortFr";
import type { TechErrorLog } from "../../../infrastructure/api/gtsApiClient";
import {
  formatTechDetailsText,
  formatTechEventText,
  formatTechStatusLabel,
  getTechStatusTone,
  resolveTechFamily
} from "../model/techErrorLogsDisplay";

/**
 * Exporte les logs techniques affichés en Excel (libellés métier, sans codes internes).
 *
 * @param logs - Lignes à exporter.
 * @returns Chemin enregistré, ou annulation utilisateur.
 */
export async function exportTechErrorLogsToExcel(logs: TechErrorLog[]) {
  const headers = ["Date", "Famille", "Événement", "Statut", "Détails"];
  const rows: string[][] = [
    headers,
    ...logs.map((log) => {
      const details = formatTechDetailsText(log.details);
      return [
        formatDateTimeFr(log.occurredAt),
        resolveTechFamily(log.code, log.source),
        formatTechEventText(log),
        formatTechStatusLabel(getTechStatusTone(log.code)),
        details ? details.replace(/\n/g, " · ") : ""
      ];
    })
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 21 }, { wch: 16 }, { wch: 60 }, { wch: 12 }, { wch: 60 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Logs techniques");
  return downloadSheetJsWorkbook(wb, `logs-techniques_${exportTimestampForFilename()}.xlsx`);
}
