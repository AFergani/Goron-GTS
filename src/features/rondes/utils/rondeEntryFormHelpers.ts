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

export function addIsoDays(dateIso: string, days: number): string {
  const base = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(base.getTime())) return dateIso;
  base.setDate(base.getDate() + days);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
}

/**
 * Dates de passage : celles enregistrées, sinon la date de demande.
 * Un départ d'horloge antérieur à l'arrivée est reporté au lendemain
 * seulement lorsqu'aucune date de départ n'est encore connue.
 */
export function resolveRondePassageDates(input: {
  requestDate: string;
  arrivalTime: string;
  departureTime: string;
  arrivalDate?: string | null;
  departureDate?: string | null;
}): { arrivalDate: string; departureDate: string } {
  const requestDate = String(input.requestDate || "").trim();
  const arrivalTime = String(input.arrivalTime || "").trim();
  const departureTime = String(input.departureTime || "").trim();
  const storedArrival = String(input.arrivalDate || "").trim();
  const storedDeparture = String(input.departureDate || "").trim();
  const arrivalDate = isIsoDate(storedArrival)
    ? storedArrival
    : arrivalTime && isIsoDate(requestDate)
      ? requestDate
      : "";
  let departureDate = isIsoDate(storedDeparture) ? storedDeparture : "";
  if (!departureDate && departureTime && isIsoDate(requestDate)) {
    const overnight = isValidTime(arrivalTime) && isValidTime(departureTime) && departureTime < arrivalTime;
    departureDate = overnight ? addIsoDays(requestDate, 1) : requestDate;
  }
  return { arrivalDate, departureDate };
}

/** Minutes entre deux horodatages. N'ajoute pas 24 h si le départ est le lendemain calendaire. */
export function computeDurationMinutes(
  arrivalDate: string,
  arrivalTime: string,
  departureDate: string,
  departureTime: string
): number | null {
  if (!isIsoDate(arrivalDate) || !isIsoDate(departureDate) || !isValidTime(arrivalTime) || !isValidTime(departureTime)) {
    return null;
  }
  const startMs = Date.parse(`${arrivalDate}T${arrivalTime}:00`);
  const endMs = Date.parse(`${departureDate}T${departureTime}:00`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  return Math.round((endMs - startMs) / 60000);
}

/** « 25 h » ou « 25 h 20 » pour une durée déjà en minutes. */
export function formatDurationHoursHint(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${String(rest).padStart(2, "0")}`;
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}
