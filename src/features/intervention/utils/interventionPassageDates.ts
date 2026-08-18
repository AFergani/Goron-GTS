/**
 * Dates et heures de passage intervention (arrivée, départ, passage minuit).
 *
 * Infère les dates manquantes sur données legacy, valide la cohérence avant enregistrement
 * et calcule la « date logique » d’affichage / filtre. Utilisé par `InterventionEntryModal`.
 */

import { isValidTime, normalizeTimeForSave } from "../../common/utils/timeInput";

export { isValidTime, normalizeTimeForSave };

export function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

function toMinutes(timeIso: string): number {
  const [h, m] = String(timeIso || "").split(":").map((part) => Number(part));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return -1;
  return h * 60 + m;
}

export function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateIso;
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

export function parseDateTimeMs(dateIso: string, timeIso: string): number | null {
  if (!isIsoDate(dateIso) || !isValidTime(timeIso)) return null;
  const ms = Date.parse(`${dateIso}T${timeIso}:00`);
  return Number.isFinite(ms) ? ms : null;
}

type PassageEntryLike = {
  requestDate: string;
  requestTime: string;
  arrivalDate?: string | null;
  arrivalTime: string;
  departureDate?: string | null;
  departureTime: string;
};

/** Date d'arrivée affichée / éditée (données existantes sans colonne dédiée). */
export function inferArrivalDateFromEntry(entry: PassageEntryLike): string {
  const stored = String(entry.arrivalDate || "").trim();
  if (isIsoDate(stored)) return stored;
  const arrivalTime = normalizeTimeForSave(entry.arrivalTime);
  const requestDate = String(entry.requestDate || "").trim();
  if (!arrivalTime || !isIsoDate(requestDate)) return "";
  const requestTime = normalizeTimeForSave(entry.requestTime);
  if (isValidTime(requestTime) && toMinutes(arrivalTime) < toMinutes(requestTime)) {
    return addDaysIso(requestDate, 1);
  }
  return requestDate;
}

/** Date de départ affichée / éditée. */
export function inferDepartureDateFromEntry(entry: PassageEntryLike): string {
  const stored = String(entry.departureDate || "").trim();
  if (isIsoDate(stored)) return stored;
  const departureTime = normalizeTimeForSave(entry.departureTime);
  const requestDate = String(entry.requestDate || "").trim();
  if (!departureTime || !isIsoDate(requestDate)) return "";
  const arrivalDate = inferArrivalDateFromEntry(entry);
  const arrivalTime = normalizeTimeForSave(entry.arrivalTime);
  const baseDate = isIsoDate(arrivalDate) ? arrivalDate : requestDate;
  if (isValidTime(arrivalTime) && toMinutes(departureTime) < toMinutes(arrivalTime)) {
    return addDaysIso(baseDate, 1);
  }
  return baseDate;
}

export function resolvePassageDatesForSave(params: {
  requestDate: string;
  arrivalDate: string;
  arrivalTime: string;
  departureDate: string;
  departureTime: string;
}): { arrivalDate: string; departureDate: string } {
  const requestDate = String(params.requestDate || "").trim();
  const arrivalTime = normalizeTimeForSave(params.arrivalTime);
  const departureTime = normalizeTimeForSave(params.departureTime);
  let arrivalDate = String(params.arrivalDate || "").trim();
  let departureDate = String(params.departureDate || "").trim();
  if (arrivalTime && !isIsoDate(arrivalDate) && isIsoDate(requestDate)) {
    arrivalDate = requestDate;
  }
  if (departureTime && !isIsoDate(departureDate)) {
    departureDate = isIsoDate(arrivalDate) ? arrivalDate : requestDate;
  }
  return { arrivalDate, departureDate };
}

/** Délai demande → arrivée en minutes (même règles que le backend / colonne « Délai »). */
export function computeInterventionDelayMinutes(params: {
  requestDate: string;
  requestTime: string;
  arrivalDate?: string | null;
  arrivalTime: string;
}): number | null {
  const requestDate = String(params.requestDate || "").trim();
  const requestTime = normalizeTimeForSave(params.requestTime);
  const arrivalTime = normalizeTimeForSave(params.arrivalTime);
  if (!isIsoDate(requestDate) || !isValidTime(requestTime) || !arrivalTime) return null;
  const startMs = parseDateTimeMs(requestDate, requestTime);
  const arrivalBase = isIsoDate(String(params.arrivalDate || "").trim())
    ? String(params.arrivalDate).trim()
    : requestDate;
  let arrivalMs = parseDateTimeMs(arrivalBase, arrivalTime);
  if (startMs == null || arrivalMs == null) return null;
  if (!isIsoDate(String(params.arrivalDate || "").trim()) && arrivalMs < startMs) {
    arrivalMs += 24 * 60 * 60 * 1000;
  }
  return Math.round((arrivalMs - startMs) / 60000);
}

function formatDateTimeFr(dateIso: string, timeIso: string): string {
  const ms = parseDateTimeMs(dateIso, timeIso);
  if (ms == null) return `${dateIso} ${timeIso}`;
  return new Date(ms).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function validatePassageDateTimes(params: {
  requestDate?: string;
  requestTime?: string;
  arrivalDate: string;
  arrivalTime: string;
  departureDate: string;
  departureTime: string;
}): string | null {
  const arrivalTime = normalizeTimeForSave(params.arrivalTime);
  const departureTime = normalizeTimeForSave(params.departureTime);
  const arrivalDate = String(params.arrivalDate || "").trim();
  const departureDate = String(params.departureDate || "").trim();
  if (arrivalTime && !isIsoDate(arrivalDate)) {
    return "La date d'arrivée est obligatoire lorsque l'heure d'arrivée est renseignée.";
  }
  if (departureTime && !isIsoDate(departureDate)) {
    return "La date de départ est obligatoire lorsque l'heure de départ est renseignée.";
  }
  if (arrivalTime && !isValidTime(arrivalTime)) return "L'heure d'arrivée est invalide.";
  if (departureTime && !isValidTime(departureTime)) return "L'heure de départ est invalide.";
  if (arrivalTime && departureTime) {
    const arrivalMs = parseDateTimeMs(arrivalDate, arrivalTime);
    const departureMs = parseDateTimeMs(departureDate, departureTime);
    if (arrivalMs != null && departureMs != null && departureMs < arrivalMs) {
      return "La date et l'heure de départ doivent être postérieures à l'arrivée.";
    }
  }
  const requestDate = String(params.requestDate || "").trim();
  const requestTime = normalizeTimeForSave(String(params.requestTime || ""));
  if (requestDate && requestTime && arrivalTime && isIsoDate(arrivalDate)) {
    const delayMinutes = computeInterventionDelayMinutes({
      requestDate,
      requestTime,
      arrivalDate,
      arrivalTime
    });
    if (delayMinutes != null && delayMinutes < 0) {
      return (
        `La date et l'heure de la demande (${formatDateTimeFr(requestDate, requestTime)}) ne peuvent pas être postérieures à l'arrivée ` +
        `(${formatDateTimeFr(arrivalDate, arrivalTime)}). Délai calculé : ${delayMinutes} min.`
      );
    }
  }
  return null;
}

export function computeInterventionLogicalDate(params: {
  requestDate: string;
  requestTime: string;
  arrivalDate?: string | null;
  arrivalTime?: string | null;
  departureDate?: string | null;
  departureTime?: string | null;
  preferredDate?: string | null;
}): { logicalDate: string; autoLogicalDate: string; shiftedAfterMidnight: boolean } {
  const requestDate = String(params.requestDate || "").trim();
  if (!isIsoDate(requestDate)) {
    return { logicalDate: "", autoLogicalDate: "", shiftedAfterMidnight: false };
  }
  const preferredDate = String(params.preferredDate || "").trim();
  const arrivalDate = String(params.arrivalDate || "").trim();
  const arrivalTime = normalizeTimeForSave(String(params.arrivalTime || ""));
  const departureDate = String(params.departureDate || "").trim();
  const departureTime = normalizeTimeForSave(String(params.departureTime || ""));

  let autoLogicalDate = requestDate;
  let shiftedAfterMidnight = false;

  if (isIsoDate(arrivalDate) && isValidTime(arrivalTime)) {
    autoLogicalDate = arrivalDate;
    shiftedAfterMidnight = arrivalDate !== requestDate;
  } else if (isValidTime(arrivalTime) || isValidTime(departureTime)) {
    const requestTime = normalizeTimeForSave(String(params.requestTime || ""));
    const referenceTime = isValidTime(arrivalTime) ? arrivalTime : departureTime;
    if (isValidTime(requestTime) && referenceTime) {
      const reqMin = toMinutes(requestTime);
      const refMin = toMinutes(referenceTime);
      if (reqMin >= 0 && refMin >= 0 && refMin < reqMin) {
        autoLogicalDate = addDaysIso(requestDate, 1);
        shiftedAfterMidnight = true;
      }
    }
  } else if (isIsoDate(departureDate) && isValidTime(departureTime)) {
    autoLogicalDate = departureDate;
    shiftedAfterMidnight = departureDate !== requestDate;
  }

  const logicalDate = isIsoDate(preferredDate) ? preferredDate : autoLogicalDate;
  return {
    logicalDate,
    autoLogicalDate,
    shiftedAfterMidnight: shiftedAfterMidnight || logicalDate !== requestDate
  };
}
