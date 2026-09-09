/**
 * Brouillon de ligne de planification (modale demande).
 */

import type { HolidayRef } from "../../../types";
import { RANDOM_PERIOD_DAY, RANDOM_PERIOD_NIGHT, type RondePlannedProfileLineRef } from "./rondePlanned.types";
import type { RondePlanningSnapshotLineV1 } from "./rondePlanningSnapshot.types";
import { addDaysIso, dateIsoToWeekdayMask } from "./rondePlannedSlotEngine";
import { formatRondePlannedLineSummary } from "./rondePlannedSummary";

export type RoundKindDraft = "OPENING" | "CLOSING" | "ACCOMPAGNEMENT" | "RANDOM";

export type LineDraft = {
  id: string;
  roundKind: RoundKindDraft;
  requestedTime: string;
  randomWindowStart: string;
  randomWindowEnd: string;
  randomRoundsCount: string;
  intervalHours: string;
  intervalEndTime: string;
  weekdaysMask: number;
  includeHolidays: boolean;
  includeHolidayEves: boolean;
};

function newLineDraftId(prefix = "line"): string {
  return crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeRoundKindDraft(value: unknown): RoundKindDraft {
  return value === "OPENING" || value === "CLOSING" || value === "ACCOMPAGNEMENT" || value === "RANDOM"
    ? value
    : "RANDOM";
}

/** Ligne brouillon par défaut (création / fallback). */
export function createDefaultLineDraft(overrides?: Partial<LineDraft>): LineDraft {
  return {
    id: newLineDraftId(),
    roundKind: "OPENING",
    requestedTime: "08:00",
    randomWindowStart: "",
    randomWindowEnd: "",
    randomRoundsCount: "",
    intervalHours: "",
    intervalEndTime: "23:59",
    weekdaysMask: 0,
    includeHolidays: false,
    includeHolidayEves: false,
    ...overrides
  };
}

export function lineRefToDraft(line: RondePlannedProfileLineRef): LineDraft {
  return createDefaultLineDraft({
    id: line.id,
    roundKind: normalizeRoundKindDraft(line.roundKind),
    requestedTime: line.requestedTime ?? "",
    randomWindowStart: line.randomWindowStart ?? "",
    randomWindowEnd: line.randomWindowEnd ?? "",
    randomRoundsCount: line.randomRoundsCount != null ? String(line.randomRoundsCount) : "",
    intervalHours: line.intervalMinutes != null ? String(line.intervalMinutes / 60) : "",
    intervalEndTime: "23:59",
    weekdaysMask: line.weekdaysMask,
    includeHolidays: Boolean(line.includeHolidays),
    includeHolidayEves: Boolean(line.includeHolidayEves)
  });
}

/** Convertit une ligne de snapshot planning en brouillon éditable. */
export function planningSnapshotLineToDraft(
  line: RondePlanningSnapshotLineV1,
  id?: string
): LineDraft {
  return createDefaultLineDraft({
    id: id ?? newLineDraftId("replay"),
    roundKind: normalizeRoundKindDraft(line.roundKind),
    requestedTime: String(line.requestedTime ?? ""),
    randomWindowStart: String(line.randomWindowStart ?? ""),
    randomWindowEnd: String(line.randomWindowEnd ?? ""),
    randomRoundsCount: String(line.randomRoundsCount ?? ""),
    intervalHours: String(line.intervalHours ?? ""),
    intervalEndTime: String(line.intervalEndTime ?? "").trim() || "23:59",
    weekdaysMask: typeof line.weekdaysMask === "number" ? line.weekdaysMask : Number(line.weekdaysMask) || 0,
    includeHolidays: Boolean(line.includeHolidays),
    includeHolidayEves: Boolean(line.includeHolidayEves)
  });
}

/** Intervalle en minutes depuis `intervalHours` (null si vide / invalide). */
export function parseDraftIntervalMinutes(line: Pick<LineDraft, "intervalHours">): number | null {
  if (!line.intervalHours.trim()) return null;
  const value = Math.max(1, Math.round(Number(line.intervalHours) * 60));
  return Number.isFinite(value) ? value : null;
}

/** Nombre de passages aléatoires depuis le brouillon (null si vide / invalide). */
export function parseDraftRoundsCount(line: Pick<LineDraft, "randomRoundsCount">): number | null {
  if (!line.randomRoundsCount.trim()) return null;
  const value = Math.max(1, Math.round(Number(line.randomRoundsCount)));
  return Number.isFinite(value) ? value : null;
}

export function hasCompleteRandomWindow(line: Pick<LineDraft, "randomWindowStart" | "randomWindowEnd">): boolean {
  return Boolean(line.randomWindowStart.trim() && line.randomWindowEnd.trim());
}

export function hasPartialRandomWindow(line: Pick<LineDraft, "randomWindowStart" | "randomWindowEnd">): boolean {
  return Boolean(line.randomWindowStart.trim() || line.randomWindowEnd.trim());
}

/**
 * Numéro affiché chronologique quand le tableau stocke la ligne la plus récente en premier.
 * Ex. `[nouvelle, ancienne]` → Ligne 2, Ligne 1.
 */
export function rondeRequestLineDisplayNumber(indexFromNewest: number, lineCount: number): number {
  return Math.max(1, lineCount - indexFromNewest);
}

/** Résumé lisible d'une ligne brouillon (aperçu / récap demande). */
export function formatLineDraftSummary(
  line: LineDraft,
  opts?: { omitWeekdayRecurrence?: boolean }
): string {
  const intervalMinutes = parseDraftIntervalMinutes(line);
  const roundsCount = parseDraftRoundsCount(line);
  const omitWeekdayRecurrence = Boolean(opts?.omitWeekdayRecurrence);
  const recurrenceKind = omitWeekdayRecurrence || !line.weekdaysMask ? "DAILY" : "WEEKLY";
  return formatRondePlannedLineSummary(
    {
      roundKind: line.roundKind,
      recurrenceKind,
      weekdaysMask: line.weekdaysMask,
      monthDay: null,
      requestedTime: line.requestedTime.trim() || null,
      intervalMinutes,
      randomPeriodMask: RANDOM_PERIOD_DAY | RANDOM_PERIOD_NIGHT,
      randomWindowStart: line.randomWindowStart.trim() || null,
      randomWindowEnd: line.randomWindowEnd.trim() || null,
      randomRoundsCount: roundsCount
    },
    { omitRecurrence: omitWeekdayRecurrence }
  );
}

export function isWeekdayEnabled(weekdaysMask: number, dateIso: string): boolean {
  if (!Number.isFinite(Number(weekdaysMask)) || Number(weekdaysMask) <= 0) return true;
  return (Number(weekdaysMask) & dateIsoToWeekdayMask(dateIso)) !== 0;
}

export function holidayMatchers(holidays: HolidayRef[] | undefined) {
  const set = new Set((holidays || []).map((h) => String(h.dateIso || "").trim()).filter(Boolean));
  return {
    isHoliday: (iso: string) => set.has(String(iso || "").trim()),
    isHolidayEve: (iso: string) => set.has(addDaysIso(String(iso || "").trim(), 1))
  };
}
