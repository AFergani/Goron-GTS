/**
 * Formatage dates / statuts intervention (UI tableau + exports Excel / Word).
 */

import { formatDateShortFr } from "../../common/utils/formatDateShortFr";
import {
  INTERVENTION_NO_WORK_ORDER_LABEL,
  type InterventionEntry
} from "../model/intervention.types";

export function formatInterventionDateTime(date: string, time: string): string {
  const dateFr = formatDateShortFr(date);
  if (!dateFr) return "—";
  const timeHm = String(time || "").trim();
  return timeHm ? `${dateFr} ${timeHm}` : dateFr;
}

/** Libellé statut pour tableau et exports. */
export function statusLabelFr(status: InterventionEntry["status"]): string {
  if (status === "CLOTURE") return "Clôturé";
  if (status === "ANNULE") return "Annulé";
  return "En cours";
}

/** Variante badge CSS (`mc-status-badge--*`). */
export function statusTone(status: InterventionEntry["status"]): "cloture" | "en-attente" | "en-cours" {
  if (status === "CLOTURE") return "cloture";
  if (status === "ANNULE") return "en-attente";
  return "en-cours";
}

/**
 * N° de bon pour le tableau / les exports.
 * « Pas de bon » seulement si le CR a commencé (clôture ou heure d’arrivée) et que le champ est resté vide.
 */
export function formatInterventionWorkOrderNumber(entry: Pick<InterventionEntry, "workOrderNumber" | "status" | "arrivalTime">): string {
  const raw = String(entry.workOrderNumber || "").trim();
  const isEmpty = !raw || raw === INTERVENTION_NO_WORK_ORDER_LABEL;
  if (!isEmpty) return raw;
  const crStarted = entry.status === "CLOTURE" || Boolean(String(entry.arrivalTime || "").trim());
  return crStarted ? INTERVENTION_NO_WORK_ORDER_LABEL : "—";
}
