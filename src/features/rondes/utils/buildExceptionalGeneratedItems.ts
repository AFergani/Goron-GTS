/**
 * Preview / création des passages exceptionnels : délègue à l’orchestrateur partagé
 * (`electron/store/domains/ronde/exceptionalSlotList.js`).
 */

import * as exceptionalSlotListModule from "../../../../electron/store/domains/ronde/exceptionalSlotList.js";
import {
  parseDraftIntervalMinutes,
  parseDraftRoundsCount,
  type LineDraft,
  type RoundKindDraft
} from "../model/rondeRequestLineDraft";
import { parseDateTimeSafeMs } from "./parseDateTimeSafeMs";
import { intervalHonorRecapNote, type DedicatedRondeAnchor, type DedicatedRondeKind } from "./intervalSeriesHonoringDedicated";

const exceptionalSlotList =
  (exceptionalSlotListModule as { default?: typeof exceptionalSlotListModule }).default ?? exceptionalSlotListModule;

export type ExceptionalGeneratedItem = {
  requestDate: string;
  requestedTime: string;
  lineIndex: number;
};

export type ExceptionalGeneratedResult = {
  items: ExceptionalGeneratedItem[];
  perLine: number[];
  /** Précision récap quand ouverture/fermeture décalent la série d’intervalle. */
  intervalHonorNote: string;
};

function isDedicatedKind(kind: RoundKindDraft): kind is DedicatedRondeKind {
  return kind === "OPENING" || kind === "CLOSING" || kind === "ACCOMPAGNEMENT";
}

/**
 * Génère les passages exceptionnels prévus (preview + création alignée sur Electron).
 *
 * @param params.lines - Lignes brouillon (ouverture, fermeture, aléatoire…).
 * @returns Passages, compteurs par ligne, et note d’ancrage.
 */
export function buildExceptionalGeneratedItems(params: {
  lines: LineDraft[];
  validFrom: string;
  validTo: string;
  validFromTime: string;
  validToTime: string;
  requestDate: string;
  requestTime: string;
  motifTypeId: string;
  holidayDateIsos: string[];
}): ExceptionalGeneratedResult {
  const perLine = params.lines.map(() => 0);
  const rawItems = exceptionalSlotList.buildDesiredExceptionalSlotList(
    {
      version: 1,
      requestDate: params.requestDate,
      requestTime: params.requestTime,
      validFrom: params.validFrom,
      validFromTime: params.validFromTime,
      validTo: params.validTo,
      validToTime: params.validToTime,
      motifTypeId: params.motifTypeId,
      lines: params.lines.map((ln) => ({
        roundKind: ln.roundKind,
        requestedTime: ln.requestedTime,
        randomWindowStart: ln.randomWindowStart,
        randomWindowEnd: ln.randomWindowEnd,
        randomRoundsCount: ln.randomRoundsCount,
        intervalHours: ln.intervalHours,
        intervalEndTime: ln.intervalEndTime || params.validToTime,
        weekdaysMask: ln.weekdaysMask,
        includeHolidays: ln.includeHolidays,
        includeHolidayEves: ln.includeHolidayEves
      }))
    },
    params.holidayDateIsos
  );

  const items: ExceptionalGeneratedItem[] = [];
  for (const slot of rawItems) {
    const lineIndex = Number.isFinite(slot.lineIndex) ? slot.lineIndex : 0;
    if (lineIndex < 0 || lineIndex >= perLine.length) continue;
    perLine[lineIndex] += 1;
    items.push({
      requestDate: slot.requestDate,
      requestedTime: slot.requestedTime,
      lineIndex
    });
  }

  const dedicated: DedicatedRondeAnchor[] = [];
  for (const item of items) {
    const ln = params.lines[item.lineIndex];
    if (!ln || !isDedicatedKind(ln.roundKind)) continue;
    const ms = parseDateTimeSafeMs(item.requestDate, item.requestedTime.trim() || "00:00");
    if (ms != null) dedicated.push({ kind: ln.roundKind, ms });
  }
  const hasSeriesLine = params.lines.some((ln) => {
    if (ln.roundKind !== "RANDOM") return false;
    return parseDraftIntervalMinutes(ln) != null || parseDraftRoundsCount(ln) != null;
  });

  return {
    items,
    perLine,
    intervalHonorNote: intervalHonorRecapNote(dedicated, hasSeriesLine)
  };
}
