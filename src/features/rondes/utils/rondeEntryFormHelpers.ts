/**
 * Helpers formulaire fiche ronde (durée, libellé journée).
 */

import { isValidTime } from "../../common/utils/timeInput";

export function formatJourneeDuLabel(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateIso;
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

export function computeDurationMinutes(requestDate: string, arrival: string, departure: string): number | null {
  if (!requestDate || !arrival || !departure || !isValidTime(arrival) || !isValidTime(departure)) return null;
  const startMs = Date.parse(`${requestDate}T${arrival}:00`);
  let endMs = Date.parse(`${requestDate}T${departure}:00`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  if (endMs < startMs) endMs += 24 * 60 * 60 * 1000;
  return Math.round((endMs - startMs) / 60000);
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}
