/**
 * Formulaire de planification → snapshot versionné pour le moteur et l’API.
 *
 * Modes : ponctuel (une journée), récurrent (lignes + période), H24 continu.
 * Valide les horaires `HH:mm` et construit `GardiennagePlanningSnapshotV1`.
 *
 * Utilisé par : `GardiennageEntryModal` (prévisualisation + soumission).
 */

import type { GardiennagePlanningLineV1, GardiennagePlanningSnapshotV1 } from "./gardiennage.types";
import { GARDIENNAGE_WEEKDAYS_ALL_MASK } from "./gardiennagePlanningCalendar";
import { isValidTime } from "../../common/utils/timeInput";

export type GardiennagePlanningFormMode = "ponctuel" | "h24" | "recurring";

/** Horizon de génération / prévisualisation pour H24 sans date de fin. */
export const GARDIENNAGE_OPEN_ENDED_HORIZON_DAYS = 90;

/** Prolongation auto lorsque la fin planifiée est à cette distance (jours) ou moins (aligné backend). */
export const GARDIENNAGE_OPEN_ENDED_EXTEND_WHEN_DAYS_LEFT = 14;

/** Date de fin cible H24 ouvert : max(début + horizon, aujourd'hui + horizon). */
export function computeOpenEndedHorizonEndDate(
  validFromDate: string,
  referenceDateIso?: string
): string {
  const ref = referenceDateIso?.trim() || new Date().toISOString().slice(0, 10);
  const from = validFromDate?.trim() || ref;
  const fromHorizon = shiftIsoDate(from, GARDIENNAGE_OPEN_ENDED_HORIZON_DAYS);
  const refHorizon = shiftIsoDate(ref, GARDIENNAGE_OPEN_ENDED_HORIZON_DAYS);
  return fromHorizon > refHorizon ? fromHorizon : refHorizon;
}

export function isValidPlanningTime(value: string): boolean {
  return isValidTime(value);
}

/** Heure de fin H24 : si absente, identique à l'heure de début (fin de période au même horaire). */
export function resolveH24ValidToTime(validFromTime: string, validToTime: string): string {
  const to = String(validToTime || "").trim();
  if (isValidPlanningTime(to)) return to;
  const from = String(validFromTime || "").trim();
  return isValidPlanningTime(from) ? from : "";
}

export function resolvePlanningFormMode(isPonctuel: boolean, isContinuous: boolean): GardiennagePlanningFormMode {
  if (isContinuous) return "h24";
  if (isPonctuel) return "ponctuel";
  return "recurring";
}

export function shiftIsoDate(isoDate: string, amount: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + amount);
  return d.toISOString().slice(0, 10);
}

/** Fin de validité pour une journée unique (passage minuit si fin ≤ début). */
export function resolvePonctuelValidToDate(validFromDate: string, startTime: string, endTime: string): string {
  if (!validFromDate || !isValidPlanningTime(startTime) || !isValidPlanningTime(endTime)) return validFromDate;
  const startMin = parseTimeToMin(startTime);
  const endMin = parseTimeToMin(endTime);
  if (startMin < 0 || endMin < 0) return validFromDate;
  if (endMin <= startMin) return shiftIsoDate(validFromDate, 1);
  return validFromDate;
}

function parseTimeToMin(hhmm: string): number {
  if (!isValidPlanningTime(hhmm)) return -1;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function formatMinToHhmm(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Infère le mode UI depuis un snapshot persisté. */
export function inferPlanningModeFromSnapshot(
  snap: GardiennagePlanningSnapshotV1
): GardiennagePlanningFormMode {
  if (snap.isContinuous) return "h24";
  if (snap.lines?.length === 1 && snap.lines[0]?.id === "ponctuel-slot") return "ponctuel";
  return "recurring";
}

/** Étend la fenêtre de validité pour inclure la fin réelle des créneaux nocturnes. */
export function resolveRecurringRangeBounds(
  validToDate: string,
  lines: GardiennagePlanningLineV1[]
): { validToDate: string; validToTime: string } {
  const hasOvernight = lines.some((line) => {
    const startMin = parseTimeToMin(line.startTime);
    const endMin = parseTimeToMin(line.endTime);
    return startMin >= 0 && endMin >= 0 && endMin <= startMin;
  });
  if (!hasOvernight) {
    return { validToDate, validToTime: "23:59" };
  }
  let maxEndMin = 0;
  for (const line of lines) {
    const endMin = parseTimeToMin(line.endTime);
    const startMin = parseTimeToMin(line.startTime);
    if (endMin >= 0 && endMin <= startMin && endMin > maxEndMin) {
      maxEndMin = endMin;
    }
  }
  return {
    validToDate: shiftIsoDate(validToDate, 1),
    validToTime: formatMinToHhmm(maxEndMin)
  };
}

function defaultLine(label: string, anchorDate: string, startTime: string, endTime: string): GardiennagePlanningLineV1 {
  return {
    id: "ponctuel-slot",
    label,
    anchorDate,
    startTime,
    endTime,
    weekdaysMask: GARDIENNAGE_WEEKDAYS_ALL_MASK,
    includeHolidays: false,
    includeHolidayEves: false
  };
}

export type BuildPlanningSnapshotInput = {
  validFromDate: string;
  validFromTime: string;
  validToDate: string;
  validToTime: string;
  isPonctuel: boolean;
  isContinuous: boolean;
  planningLines: GardiennagePlanningLineV1[];
  fallbackDate?: string;
};

/** Construit le snapshot envoyé au moteur / backend selon le mode actif. */
export function buildEffectivePlanningSnapshot(input: BuildPlanningSnapshotInput): GardiennagePlanningSnapshotV1 {
  const fallback = input.fallbackDate || new Date().toISOString().slice(0, 10);
  const fromDate = input.validFromDate || fallback;
  const mode = resolvePlanningFormMode(input.isPonctuel, input.isContinuous);

  if (mode === "h24") {
    const toDateRaw = input.validToDate?.trim() || "";
    const isOpenEnded = !toDateRaw;
    const toDate = isOpenEnded
      ? computeOpenEndedHorizonEndDate(fromDate)
      : toDateRaw;
    const validToTime = resolveH24ValidToTime(input.validFromTime, input.validToTime);
    return {
      version: 1,
      validFromDate: fromDate,
      validFromTime: input.validFromTime,
      validToDate: toDate,
      validToTime,
      isContinuous: true,
      isOpenEnded,
      lines: []
    };
  }

  if (mode === "ponctuel") {
    const startTime = input.validFromTime;
    const endTime = input.validToTime;
    const validToDate = resolvePonctuelValidToDate(fromDate, startTime, endTime);
    return {
      version: 1,
      validFromDate: fromDate,
      validFromTime: startTime,
      validToDate,
      validToTime: endTime,
      isContinuous: false,
      lines: [defaultLine("Journée unique", fromDate, startTime, endTime)]
    };
  }

  const toDate = input.validToDate?.trim();
  if (!toDate || toDate < fromDate) {
    /* Pas de date Au : snapshot vide pour la prévisualisation (soumission bloquée côté formulaire). */
    return {
      version: 1,
      validFromDate: fromDate,
      validFromTime: "00:00",
      validToDate: fromDate,
      validToTime: "00:00",
      userValidToDate: toDate || "",
      isContinuous: false,
      lines: []
    };
  }
  const recurringBounds = resolveRecurringRangeBounds(toDate, input.planningLines);
  return {
    version: 1,
    validFromDate: fromDate,
    validFromTime: "00:00",
    validToDate: recurringBounds.validToDate,
    validToTime: recurringBounds.validToTime,
    userValidToDate: toDate,
    isContinuous: false,
    lines: input.planningLines
  };
}

export function isPlanningFormValid(input: BuildPlanningSnapshotInput): boolean {
  const fromDate = input.validFromDate?.trim();
  if (!fromDate) return false;
  const mode = resolvePlanningFormMode(input.isPonctuel, input.isContinuous);

  if (mode === "ponctuel") {
    return isValidPlanningTime(input.validFromTime) && isValidPlanningTime(input.validToTime);
  }

  if (mode === "h24") {
    if (!isValidPlanningTime(input.validFromTime)) return false;
    const effectiveToTime = resolveH24ValidToTime(input.validFromTime, input.validToTime);
    if (!effectiveToTime) return false;
    const toDate = input.validToDate?.trim();
    if (!toDate) return true;
    if (toDate < fromDate) return false;
    const rangeStart = `${fromDate}T${input.validFromTime}`;
    const rangeEnd = `${toDate}T${effectiveToTime}`;
    return rangeStart < rangeEnd;
  }

  const toDate = input.validToDate?.trim();
  if (!toDate || toDate < fromDate) return false;
  return input.planningLines.length > 0
    && input.planningLines.every((line) => isValidPlanningTime(line.startTime) && isValidPlanningTime(line.endTime));
}
