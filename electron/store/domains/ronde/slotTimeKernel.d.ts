/**
 * Types du noyau d’horaires de ronde (slotTimeKernel.js).
 */

export type DedicatedRondeKind = "OPENING" | "CLOSING" | "ACCOMPAGNEMENT";

export type DedicatedRondeAnchor = {
  kind: DedicatedRondeKind | string;
  ms: number;
};

export type IntervalSlotHm = {
  requestDate: string;
  requestedTime: string;
};

export type RandomWindowSlot = IntervalSlotHm & {
  occurrenceDateIso: string;
  calendarDateIso: string;
};

export const TIME_RE: RegExp;
export const MAX_HONORED_RANDOM_SLOTS: number;

export function addDaysIso(dateIso: string, deltaDays: number): string;
export function parseDateTimeSafeMs(dateIso: string, hhmm: string): number | null;
export function walkIntervalHonoringOpeningClosing(params: {
  validityStartMs: number;
  validityEndMs: number;
  intervalMinutes: number;
  dedicated: DedicatedRondeAnchor[];
}): IntervalSlotHm[];
export function generateCountSlotsHonoringDedicated(params: {
  rangeStartMs: number;
  rangeEndMs: number;
  count: number;
  dedicated: DedicatedRondeAnchor[];
}): IntervalSlotHm[];
export function generateRandomWindowSlots(params: {
  anchorDateIso: string;
  windowStart: string;
  windowEnd: string;
  intervalMinutes: number | null;
  roundsCount: number | null;
  dedicated: DedicatedRondeAnchor[];
}): RandomWindowSlot[];
export function intervalHonorRecapNote(dedicated: DedicatedRondeAnchor[], seriesEnabled: boolean): string;
