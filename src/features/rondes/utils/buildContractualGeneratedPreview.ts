/**
 * Aperçu d’une nuit type contractuelle (même moteur que la liste planifiée).
 * Compte les passages du jour d’ancre + ouverture / accompagnement du matin suivant si fenêtre nuit.
 */

import type { RondePlannedProfileLineRef, RondePlannedProfileRef } from "../model/rondePlanned.types";
import { addDaysIso, windowCrossesMidnight } from "../model/rondePlannedSlotEngine";
import { buildApplicablePlannedSlots } from "../model/plannedSlots";
import {
  hasCompleteRandomWindow,
  parseDraftIntervalMinutes,
  parseDraftRoundsCount,
  type LineDraft
} from "../model/rondeRequestLineDraft";
import { buildRondeProfileLinesFromDrafts } from "./buildRondeProfileLinesFromDrafts";
import { hhmmToMinutes, isRondeTimeHm } from "./rondeTime";
import { parseDateTimeSafeMs } from "./parseDateTimeSafeMs";
import { intervalHonorRecapNote, type DedicatedRondeAnchor } from "./intervalSeriesHonoringDedicated";
import type { ExceptionalGeneratedResult } from "./buildExceptionalGeneratedItems";

function syntheticProfileFromDrafts(params: {
  lines: LineDraft[];
  validFrom: string;
  validTo: string;
  siteId: string | null;
  motifTypeId: string;
}): RondePlannedProfileRef {
  const payloads = buildRondeProfileLinesFromDrafts(params.lines, params.motifTypeId);
  const lines: RondePlannedProfileLineRef[] = payloads.map((pl, index) => ({
    id: pl.id || `preview-line-${index}`,
    profileId: "__preview__",
    sortOrder: index,
    roundKind: pl.roundKind,
    recurrenceKind: pl.recurrenceKind,
    weekdaysMask: pl.weekdaysMask,
    monthDay: pl.monthDay,
    requestedTime: pl.requestedTime || null,
    intervalMinutes: pl.intervalMinutes,
    randomPeriodMask: pl.randomPeriodMask,
    randomWindowStart: pl.randomWindowStart || null,
    randomWindowEnd: pl.randomWindowEnd || null,
    randomRoundsCount: pl.randomRoundsCount,
    includeHolidays: Boolean(pl.includeHolidays),
    includeHolidayEves: Boolean(pl.includeHolidayEves),
    rangeStartDate: pl.rangeStartDate,
    rangeEndDate: pl.rangeEndDate,
    motifTypeId: pl.motifTypeId,
    motifTypeLabel: null,
    createdAt: "",
    updatedAt: ""
  }));
  return {
    id: "__preview__",
    label: "Aperçu",
    siteId: params.siteId?.trim() || "__preview-site__",
    siteDisplay: "",
    intervenantId: null,
    intervenantDisplay: null,
    notes: "",
    planningValidFrom: params.validFrom,
    planningValidTo: params.validTo.trim() || null,
    cancellationRequestReason: null,
    cancellationRequestedAt: null,
    cancellationRequestedBy: null,
    isActive: true,
    validatedAt: null,
    validatedByUsername: null,
    createRoundsEnabled: true,
    closureFormEnabled: false,
    closureFields: [],
    lines,
    createdAt: "",
    updatedAt: ""
  };
}

/**
 * Compte les fiches d’une nuit type à partir du début de validité (moteur contractuel).
 *
 * @returns Mêmes compteurs / note que la preview exceptionnelle.
 */
export function buildContractualGeneratedPreview(params: {
  lines: LineDraft[];
  validFrom: string;
  validTo: string;
  siteId: string | null;
  motifTypeId: string;
  holidayDateIsos: string[];
}): ExceptionalGeneratedResult {
  const perLine = params.lines.map(() => 0);
  const empty = (): ExceptionalGeneratedResult => ({ items: [], perLine, intervalHonorNote: "" });
  const from = params.validFrom.trim();
  if (!from) return empty();

  const profile = syntheticProfileFromDrafts({
    lines: params.lines,
    validFrom: from,
    validTo: params.validTo,
    siteId: params.siteId,
    motifTypeId: params.motifTypeId
  });
  const lineIndexById = new Map(params.lines.map((line, index) => [line.id, index]));
  const items: ExceptionalGeneratedResult["items"] = [];

  const pushSlot = (dateIso: string, requestedTime: string | null, profileLineId: string) => {
    const idx = lineIndexById.get(profileLineId);
    if (idx == null) return;
    perLine[idx] += 1;
    items.push({ requestDate: dateIso, requestedTime: requestedTime || "", lineIndex: idx });
  };

  const slotsAnchor = buildApplicablePlannedSlots([profile], from, params.holidayDateIsos);
  for (const slot of slotsAnchor) {
    pushSlot(from, slot.requestedTime, slot.profileLineId);
  }

  const overnightWindows = params.lines.filter(
    (ln) =>
      ln.roundKind === "RANDOM" &&
      hasCompleteRandomWindow(ln) &&
      windowCrossesMidnight(ln.randomWindowStart.trim(), ln.randomWindowEnd.trim())
  );
  if (overnightWindows.length) {
    const nextIso = addDaysIso(from, 1);
    const maxMorning = Math.max(
      ...overnightWindows.map((ln) => hhmmToMinutes(ln.randomWindowEnd.trim())),
      0
    );
    const slotsNext = buildApplicablePlannedSlots([profile], nextIso, params.holidayDateIsos);
    for (const slot of slotsNext) {
      if (slot.roundKind !== "OPENING" && slot.roundKind !== "ACCOMPAGNEMENT") continue;
      const hm = slot.requestedTime?.trim() || "";
      if (!isRondeTimeHm(hm) || hhmmToMinutes(hm) > maxMorning) continue;
      pushSlot(nextIso, slot.requestedTime, slot.profileLineId);
    }
  }

  const dedicated: DedicatedRondeAnchor[] = [];
  for (const ln of params.lines) {
    if (ln.roundKind !== "OPENING" && ln.roundKind !== "CLOSING" && ln.roundKind !== "ACCOMPAGNEMENT") continue;
    const time = ln.requestedTime.trim();
    if (!isRondeTimeHm(time)) continue;
    const ms = parseDateTimeSafeMs(from, time);
    if (ms != null) dedicated.push({ kind: ln.roundKind, ms });
    if (overnightWindows.length && ln.roundKind === "OPENING") {
      const nextMs = parseDateTimeSafeMs(addDaysIso(from, 1), time);
      if (nextMs != null) dedicated.push({ kind: ln.roundKind, ms: nextMs });
    }
  }
  const hasSeries = params.lines.some(
    (ln) => ln.roundKind === "RANDOM" && (parseDraftIntervalMinutes(ln) != null || parseDraftRoundsCount(ln) != null)
  );

  return {
    items,
    perLine,
    intervalHonorNote: intervalHonorRecapNote(dedicated, hasSeries)
  };
}
