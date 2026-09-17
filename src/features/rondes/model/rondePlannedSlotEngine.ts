/**
 * Moteur de génération des créneaux planifiés (récurrence, fenêtres aléatoires, fériés).
 *
 * Utilisé par `plannedSlots`, modales de demande et onglet planification.
 */

import type { RondePlannedProfileLineRef, RondePlannedProfileRef, RondePlannedRoundKind } from "./rondePlanned.types";
import { RANDOM_PERIOD_DAY, RANDOM_PERIOD_NIGHT } from "./rondePlanned.types";
import { formatLocalDateIso } from "./rondeCalendarLocal";
import { hhmmToMinutes, isRondeTimeHm } from "../utils/rondeTime";
import {
  generateRandomWindowSlots,
  MAX_HONORED_RANDOM_SLOTS,
  type DedicatedRondeAnchor
} from "../utils/intervalSeriesHonoringDedicated";

/** Bits semaine : lun=1 … dim=64 */
export function dateIsoToWeekdayMask(dateIso: string): number {
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return 0;
  const day = d.getDay();
  const idxFromMon = day === 0 ? 6 : day - 1;
  return 1 << idxFromMon;
}

/**
 * Masque des jours de semaine présents dans [fromIso, toIso] (inclus).
 * Retourne 0 si bornes invalides.
 */
export function weekdaysMaskForInclusiveDateRange(fromIso: string, toIso: string): number {
  const from = String(fromIso || "").trim();
  const to = String(toIso || "").trim();
  if (!from || !to || to < from) return 0;
  let mask = 0;
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < 400) {
    mask |= dateIsoToWeekdayMask(cursor);
    cursor = addDaysIso(cursor, 1);
    guard += 1;
  }
  return mask;
}

/** Nombre de jours calendaires inclus entre deux ISO (0 si invalide). */
export function inclusiveCalendarDayCount(fromIso: string, toIso: string): number {
  const from = String(fromIso || "").trim();
  const to = String(toIso || "").trim();
  if (!from || !to || to < from) return 0;
  let count = 0;
  let cursor = from;
  while (cursor <= to && count < 400) {
    count += 1;
    cursor = addDaysIso(cursor, 1);
  }
  return count;
}

const MAX_RANDOM_SLOTS = MAX_HONORED_RANDOM_SLOTS;

export type GeneratedPlannedSlot = {
  profileLineId: string;
  slotIndex: number;
  slotKey: string;
  roundKind: RondePlannedRoundKind;
  requestedTime: string | null;
  /** Jour d’affichage (ancre si la fenêtre traverse minuit). */
  calendarDateIso: string;
  /** Jour calendaire réel de l’horaire (peut être le lendemain si la fenêtre traverse minuit). */
  occurrenceDateIso: string;
};

export function windowCrossesMidnight(startHHMM: string, endHHMM: string): boolean {
  return hhmmToMinutes(endHHMM) <= hhmmToMinutes(startHHMM);
}

export function addDaysIso(dateIso: string, deltaDays: number): string {
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateIso;
  d.setDate(d.getDate() + deltaDays);
  return formatLocalDateIso(d);
}

/** Profil actif sur une date (plage globale Du / Au ; Au vide = sans fin). */
export function profilePlanningAppliesOnDate(profile: RondePlannedProfileRef, dateIso: string): boolean {
  const from = profile.planningValidFrom?.trim();
  const to = profile.planningValidTo?.trim();
  if (from && dateIso < from) return false;
  if (to && dateIso > to) return false;
  return true;
}

/** Récurrence au niveau ligne (héritage DAILY / MONTHLY / DATE_RANGE / WEEKLY). */
export function lineRecurrenceMatchesDate(line: RondePlannedProfileLineRef, dateIso: string): boolean {
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  switch (line.recurrenceKind) {
    case "DATE_RANGE": {
      const a = line.rangeStartDate?.trim();
      const b = line.rangeEndDate?.trim();
      if (!a || !b) return false;
      return dateIso >= a && dateIso <= b;
    }
    case "DAILY":
      return true;
    case "WEEKLY":
      // Règle métier: aucun toggle jour coché => appliquer sur tous les jours de la plage.
      if ((line.weekdaysMask ?? 0) <= 0) return true;
      return (line.weekdaysMask & dateIsoToWeekdayMask(dateIso)) !== 0;
    case "MONTHLY":
      return line.monthDay != null && d.getDate() === line.monthDay;
    default:
      return false;
  }
}

export function lineAndProfileApplyOnDate(
  profile: RondePlannedProfileRef,
  line: RondePlannedProfileLineRef,
  dateIso: string,
  options: { isHoliday: boolean; isHolidayEve: boolean } = { isHoliday: false, isHolidayEve: false }
): boolean {
  if (!profilePlanningAppliesOnDate(profile, dateIso)) return false;
  // Règle métier: un jour férié est exclu par défaut si le toggle dédié n'est pas activé.
  if (options.isHoliday && !line.includeHolidays) return false;
  if (lineRecurrenceMatchesDate(line, dateIso)) return true;
  // Règle métier: les toggles férié / veille ajoutent des dates supplémentaires en mode hebdomadaire.
  if (line.recurrenceKind !== "WEEKLY") return false;
  if (options.isHoliday && line.includeHolidays) return true;
  if (options.isHolidayEve && line.includeHolidayEves) return true;
  return false;
}

function pickEmittedRandomKind(line: RondePlannedProfileLineRef, minutesFromMidnight: number): RondePlannedRoundKind {
  const raw = line.randomPeriodMask;
  const mask =
    raw == null || !Number.isFinite(Number(raw)) ? 3 : Math.min(3, Math.max(1, Math.round(Number(raw))));
  if (mask === RANDOM_PERIOD_DAY) return "RANDOM_DAY";
  if (mask === RANDOM_PERIOD_NIGHT) return "RANDOM_NIGHT";
  const h = minutesFromMidnight / 60;
  const isDay = h >= 6 && h < 18;
  return isDay ? "RANDOM_DAY" : "RANDOM_NIGHT";
}

function parseLocalDateTime(dateIso: string, hhmm: string): Date {
  return new Date(`${dateIso}T${hhmm}:00`);
}

function mapHonoredSlotsToSpecs(
  line: RondePlannedProfileLineRef,
  slots: Array<{ requestDate: string; requestedTime: string }>,
  crosses: boolean,
  anchorDateIso: string
): GeneratedPlannedSlot[] {
  const out: GeneratedPlannedSlot[] = [];
  let slotIndex = 0;
  for (const slot of slots) {
    const t = parseLocalDateTime(slot.requestDate, slot.requestedTime);
    if (Number.isNaN(t.getTime())) continue;
    const minutesFromMidnight = t.getHours() * 60 + t.getMinutes();
    const occurrenceDateIso = formatLocalDateIso(t);
    const calendarDateIso = crosses ? anchorDateIso : occurrenceDateIso;
    out.push({
      profileLineId: line.id,
      slotIndex,
      slotKey: `${line.id}:${slotIndex}`,
      roundKind: pickEmittedRandomKind(line, minutesFromMidnight),
      requestedTime: slot.requestedTime,
      calendarDateIso,
      occurrenceDateIso
    });
    slotIndex += 1;
  }
  return out;
}

/**
 * Crée des horaires répartis dans la fenêtre [début ; fin] (fin ≤ début ⇒ lendemain).
 * Ouverture / fermeture / accompagnement du même profil (nuit) ne sont pas rejoués.
 * `calendarDateIso` = jour d’affichage (ancre si nuit) ; `occurrenceDateIso` = jour réel de l’heure.
 *
 * @param dedicated - Ancres dédiées de la nuit (même profil), optionnel.
 */
export function generateRandomSlotSpecs(
  line: RondePlannedProfileLineRef,
  anchorDateIso: string,
  dedicated: DedicatedRondeAnchor[] = []
): GeneratedPlannedSlot[] {
  const ws = line.randomWindowStart?.trim() || "";
  const we = line.randomWindowEnd?.trim() || "";
  if (!isRondeTimeHm(ws) || !isRondeTimeHm(we)) {
    const out: GeneratedPlannedSlot[] = [];
    const mask =
      line.randomPeriodMask == null || !Number.isFinite(Number(line.randomPeriodMask))
        ? 3
        : Math.min(3, Math.max(1, Math.round(Number(line.randomPeriodMask))));
    let idx = 0;
    if (mask & RANDOM_PERIOD_DAY) {
      out.push({
        profileLineId: line.id,
        slotIndex: idx,
        slotKey: `${line.id}:${idx}`,
        roundKind: "RANDOM_DAY",
        requestedTime: null,
        calendarDateIso: anchorDateIso,
        occurrenceDateIso: anchorDateIso
      });
      idx += 1;
    }
    if (mask & RANDOM_PERIOD_NIGHT) {
      out.push({
        profileLineId: line.id,
        slotIndex: idx,
        slotKey: `${line.id}:${idx}`,
        roundKind: "RANDOM_NIGHT",
        requestedTime: null,
        calendarDateIso: anchorDateIso,
        occurrenceDateIso: anchorDateIso
      });
    }
    return out;
  }

  const crosses = windowCrossesMidnight(ws, we);
  const startMs = parseLocalDateTime(anchorDateIso, ws).getTime();
  const endIso = crosses ? addDaysIso(anchorDateIso, 1) : anchorDateIso;
  const endMs = parseLocalDateTime(endIso, we).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
    return [];
  }

  const intervalMin =
    line.intervalMinutes != null && Number.isFinite(Number(line.intervalMinutes)) && Number(line.intervalMinutes) >= 1
      ? Math.min(100080, Math.round(Number(line.intervalMinutes)))
      : null;
  const rounds =
    line.randomRoundsCount != null && Number.isFinite(Number(line.randomRoundsCount)) && Number(line.randomRoundsCount) >= 1
      ? Math.min(MAX_RANDOM_SLOTS, Math.round(Number(line.randomRoundsCount)))
      : null;

  return mapHonoredSlotsToSpecs(
    line,
    generateRandomWindowSlots({
      anchorDateIso,
      windowStart: ws,
      windowEnd: we,
      intervalMinutes: intervalMin,
      roundsCount: rounds,
      dedicated
    }),
    crosses,
    anchorDateIso
  );
}

/** Ancres (jours calendaires) pour lesquelles une ligne aléatoire peut produire un créneau affiché sur `targetDateIso`. */
export function randomAnchorDatesForTargetDay(
  profile: RondePlannedProfileRef,
  line: RondePlannedProfileLineRef,
  targetDateIso: string,
  options: {
    isHoliday: (dateIso: string) => boolean;
    isHolidayEve: (dateIso: string) => boolean;
  }
): string[] {
  const anchors = new Set<string>();
  if (
    lineAndProfileApplyOnDate(profile, line, targetDateIso, {
      isHoliday: options.isHoliday(targetDateIso),
      isHolidayEve: options.isHolidayEve(targetDateIso)
    })
  ) {
    anchors.add(targetDateIso);
  }
  const ws = line.randomWindowStart?.trim() || "";
  const we = line.randomWindowEnd?.trim() || "";
  if (!isRondeTimeHm(ws) || !isRondeTimeHm(we)) return [...anchors];
  if (!windowCrossesMidnight(ws, we)) return [...anchors];
  const prev = addDaysIso(targetDateIso, -1);
  if (
    lineAndProfileApplyOnDate(profile, line, prev, {
      isHoliday: options.isHoliday(prev),
      isHolidayEve: options.isHolidayEve(prev)
    })
  ) {
    anchors.add(prev);
  }
  return [...anchors];
}
