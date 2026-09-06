/**
 * Moteur de génération des créneaux planifiés (récurrence, fenêtres aléatoires, fériés).
 *
 * Utilisé par `plannedSlots`, modales de demande et onglet planification.
 */

import type { RondePlannedProfileLineRef, RondePlannedProfileRef, RondePlannedRoundKind } from "./rondePlanned.types";
import { RANDOM_PERIOD_DAY, RANDOM_PERIOD_NIGHT } from "./rondePlanned.types";
import { formatLocalDateIso } from "./rondeCalendarLocal";
import { hhmmToMinutes, isRondeTimeHm } from "../utils/rondeTime";

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

const MAX_RANDOM_SLOTS = 48;

export type GeneratedPlannedSlot = {
  profileLineId: string;
  slotIndex: number;
  slotKey: string;
  roundKind: RondePlannedRoundKind;
  requestedTime: string | null;
  calendarDateIso: string;
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

/**
 * Crée des horaires répartis dans la fenêtre [début ; fin] (fin ≤ début ⇒ lendemain).
 */
export function generateRandomSlotSpecs(line: RondePlannedProfileLineRef, anchorDateIso: string): GeneratedPlannedSlot[] {
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
        calendarDateIso: anchorDateIso
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
        calendarDateIso: anchorDateIso
      });
    }
    return out;
  }

  const crosses = windowCrossesMidnight(ws, we);
  const startM = hhmmToMinutes(ws);
  const endM = hhmmToMinutes(we);
  const span = crosses ? 24 * 60 - startM + endM : Math.max(0, endM - startM);
  if (span <= 0) {
    const t0 = new Date(`${anchorDateIso}T${ws}:00`);
    const calendarDateIso = anchorDateIso;
    const time = `${String(t0.getHours()).padStart(2, "0")}:${String(t0.getMinutes()).padStart(2, "0")}`;
    const roundKind = pickEmittedRandomKind(line, t0.getHours() * 60 + t0.getMinutes());
    return [
      {
        profileLineId: line.id,
        slotIndex: 0,
        slotKey: `${line.id}:0`,
        roundKind,
        requestedTime: time,
        calendarDateIso
      }
    ];
  }

  const intervalMin =
    line.intervalMinutes != null && Number.isFinite(Number(line.intervalMinutes)) && Number(line.intervalMinutes) >= 1
      ? Math.min(100080, Math.round(Number(line.intervalMinutes)))
      : null;
  const rounds =
    line.randomRoundsCount != null && Number.isFinite(Number(line.randomRoundsCount)) && Number(line.randomRoundsCount) >= 1
      ? Math.min(MAX_RANDOM_SLOTS, Math.round(Number(line.randomRoundsCount)))
      : null;

  let count = 1;
  if (intervalMin != null && intervalMin >= 1 && span > 0) {
    count = Math.floor(span / intervalMin) + 1;
    count = Math.min(MAX_RANDOM_SLOTS, Math.max(1, count));
  } else if (rounds != null) {
    count = rounds;
  }

  const offsets: number[] = [];
  if (count === 1) {
    offsets.push(0);
  } else {
    for (let i = 0; i < count; i += 1) {
      offsets.push(Math.round((i * span) / (count - 1)));
    }
  }

  const out: GeneratedPlannedSlot[] = [];
  let slotIndex = 0;
  for (const off of offsets) {
    const startMs = parseLocalDateTime(anchorDateIso, ws).getTime();
    const t = new Date(startMs + off * 60 * 1000);
    if (Number.isNaN(t.getTime())) continue;
    const hh = String(t.getHours()).padStart(2, "0");
    const mm = String(t.getMinutes()).padStart(2, "0");
    const time = `${hh}:${mm}`;
    /*
     * Pour une fenêtre qui franchit minuit, tous les créneaux (y compris ceux
     * physiquement le lendemain matin) restent rattachés à la date ancre.
     * Cela garantit que "Nombre de rondes: 2" sur 20:00→08:00 produit bien
     * 2 badges sur la journée de l'ancre, pas un badge par jour calendaire.
     */
    const calendarDateIso = crosses ? anchorDateIso : (() => {
      const y = t.getFullYear();
      const mo = String(t.getMonth() + 1).padStart(2, "0");
      const da = String(t.getDate()).padStart(2, "0");
      return `${y}-${mo}-${da}`;
    })();
    const minutesFromMidnight = t.getHours() * 60 + t.getMinutes();
    const roundKind = pickEmittedRandomKind(line, minutesFromMidnight);
    out.push({
      profileLineId: line.id,
      slotIndex,
      slotKey: `${line.id}:${slotIndex}`,
      roundKind,
      requestedTime: time,
      calendarDateIso
    });
    slotIndex += 1;
  }
  return out;
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
