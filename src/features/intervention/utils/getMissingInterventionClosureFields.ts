/**
 * Pré-contrôle des champs obligatoires avant clôture d'une intervention.
 */

import { isValidTime, normalizeTimeForSave } from "../../common/utils/timeInput";
import { isIsoDate, resolvePassageDatesForSave } from "./interventionPassageDates";

export function getMissingInterventionClosureFields(params: {
  requestDate: string;
  arrivalDate: string;
  arrivalTime: string;
  departureDate: string;
  departureTime: string;
  report: string;
}): string[] {
  const missing: string[] = [];
  const { arrivalDate, departureDate } = resolvePassageDatesForSave({
    requestDate: params.requestDate,
    arrivalDate: params.arrivalDate,
    arrivalTime: params.arrivalTime,
    departureDate: params.departureDate,
    departureTime: params.departureTime
  });
  const arrivalNorm = normalizeTimeForSave(params.arrivalTime);
  const departureNorm = normalizeTimeForSave(params.departureTime);
  if (!isIsoDate(arrivalDate) || !arrivalNorm || !isValidTime(arrivalNorm)) {
    missing.push("date et heure d'arrivée");
  }
  if (!isIsoDate(departureDate) || !departureNorm || !isValidTime(departureNorm)) {
    missing.push("date et heure de départ");
  }
  if (!String(params.report || "").trim()) missing.push("compte-rendu");
  return missing;
}
