import type { GardiennagePlanningLineV1 } from "./gardiennage.types";

/** Bits alignés sur Date.getDay() : dim=1, lun=2, … sam=64 */
export const GARDIENNAGE_WEEKDAY_BITS = [
  { bit: 2, label: "Lun" },
  { bit: 4, label: "Mar" },
  { bit: 8, label: "Mer" },
  { bit: 16, label: "Jeu" },
  { bit: 32, label: "Ven" },
  { bit: 64, label: "Sam" },
  { bit: 1, label: "Dim" }
] as const;

/** Tous les jours de la semaine (dim → sam). */
export const GARDIENNAGE_WEEKDAYS_ALL_MASK = 127;

export type GardiennageHolidayMatchers = {
  isHoliday: (dateIso: string) => boolean;
  isHolidayEve: (dateIso: string) => boolean;
};

export function dayBitFromIsoDate(isoDate: string): number {
  const day = new Date(`${isoDate}T12:00:00`).getDay();
  return 1 << day;
}

export function shiftIsoDate(isoDate: string, amount: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + amount);
  return d.toISOString().slice(0, 10);
}

export function isIsoDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function buildHolidayMatchers(holidayDateIsos: string[]): GardiennageHolidayMatchers {
  const set = new Set(holidayDateIsos.map((iso) => String(iso || "").trim()).filter(Boolean));
  return {
    isHoliday: (iso) => set.has(String(iso || "").trim()),
    isHolidayEve: (iso) => set.has(shiftIsoDate(String(iso || "").trim(), 1))
  };
}

/** Récurrence hebdomadaire : aucun jour coché => tous les jours (comme ronde planifiée). */
export function lineMatchesWeekday(line: GardiennagePlanningLineV1, dateIso: string): boolean {
  const mask = Number(line.weekdaysMask ?? 0);
  if (mask <= 0) return true;
  return (mask & dayBitFromIsoDate(dateIso)) !== 0;
}

/** Jours d'application d'une ligne récurrente (hors date ancrée). */
export function gardiennageLineAppliesOnDate(
  line: GardiennagePlanningLineV1,
  dateIso: string,
  holiday: GardiennageHolidayMatchers
): boolean {
  if (isIsoDate(line.anchorDate)) return line.anchorDate === dateIso;
  if (holiday.isHoliday(dateIso) && !line.includeHolidays) return false;
  if (lineMatchesWeekday(line, dateIso)) return true;
  if (holiday.isHoliday(dateIso) && line.includeHolidays) return true;
  if (holiday.isHolidayEve(dateIso) && line.includeHolidayEves) return true;
  return false;
}

export function collectActiveDatesForLine(
  line: GardiennagePlanningLineV1,
  validFromDate: string,
  validToDate: string,
  skipDates: Set<string>,
  holiday: GardiennageHolidayMatchers
): string[] {
  if (isIsoDate(line.anchorDate)) {
    return skipDates.has(line.anchorDate) ? [] : [line.anchorDate];
  }
  const activeDates: string[] = [];
  let cursor = validFromDate;
  while (cursor <= validToDate) {
    if (!skipDates.has(cursor) && gardiennageLineAppliesOnDate(line, cursor, holiday)) {
      activeDates.push(cursor);
    }
    cursor = shiftIsoDate(cursor, 1);
  }
  return activeDates;
}
