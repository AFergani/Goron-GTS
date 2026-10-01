/**
 * Export Excel de la liste interventions filtrée (colonnes métier, pas d’UUID).
 */

import { buildFilteredListWorkbook, downloadSheetJsWorkbook } from "../../common/utils/downloadSheetJsWorkbook";
import { exportTimestampFrForFilename } from "../../common/utils/exportFilename";
import { type InterventionEntry } from "../model/intervention.types";
import {
  formatInterventionDateTime,
  formatInterventionWorkOrderNumber,
  statusLabelFr
} from "./interventionExportFormat";

const HEADERS = [
  "N°",
  "Date / Demande",
  "Clients (Code site)",
  "Motif de la demande d'inter",
  "Prestataire",
  "Arrivée",
  "Départ",
  "Delai d'inter (min)",
  "N deg bon inter",
  "Compte-rendu",
  "Etat"
] as const;

/**
 * Exporte la liste filtrée en Excel.
 *
 * @param entries - Lignes à exporter.
 * @returns Chemin enregistré, ou annulation utilisateur.
 */
export async function exportInterventionToExcel(entries: InterventionEntry[]) {
  const rows: Array<Array<string | number>> = [
    [...HEADERS],
    ...entries.map((entry) => [
      entry.dailyCode || "",
      formatInterventionDateTime(entry.requestDate, entry.requestTime),
      entry.siteDisplay || "",
      entry.requestReason || "",
      entry.intervenantName || "",
      entry.arrivalTime ? formatInterventionDateTime(entry.arrivalDate || entry.requestDate, entry.arrivalTime) : "",
      entry.departureTime ? formatInterventionDateTime(entry.departureDate || entry.arrivalDate || entry.requestDate, entry.departureTime) : "",
      entry.delayMinutes ?? "",
      formatInterventionWorkOrderNumber(entry),
      entry.report || "",
      statusLabelFr(entry.status)
    ])
  ];

  const wb = buildFilteredListWorkbook("Intervention", rows, [14, 20, 36, 45, 24, 20, 20, 18, 18, 50, 14]);
  return downloadSheetJsWorkbook(wb, `intervention_export_${exportTimestampFrForFilename()}.xlsx`);
}
