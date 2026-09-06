/**
 * Créneaux planifiés applicables pour une date (agrégation par site, libellés passage).
 *
 * S’appuie sur `rondePlannedSlotEngine` pour la génération aléatoire et les récurrences.
 */

import type { RondePlannedProfileRef, RondePlannedRoundKind } from "./rondePlanned.types";
import {
  addDaysIso,
  generateRandomSlotSpecs,
  lineAndProfileApplyOnDate,
  profilePlanningAppliesOnDate,
  randomAnchorDatesForTargetDay
} from "./rondePlannedSlotEngine";
import { formatRondePlannedRoundKind } from "./rondePlannedSummary";

/** Créneau applicable pour une journée et une ligne de profil. */
export type ApplicablePlannedSlot = {
  siteId: string;
  siteDisplay: string;
  profileId: string;
  profileLabel: string;
  /** Identifiant stable de la ligne de profil (pour corrélation des fiches). */
  profileLineId: string;
  /** Index du créneau sur la même ligne (aléatoire répété). */
  slotIndex: number;
  /** Clé unique profil + ligne + index (stockée sur la fiche planifiée). */
  slotKey: string;
  defaultIntervenantId: string | null;
  roundKind: RondePlannedRoundKind;
  motifTypeId: string | null;
  requestedTime: string | null;
  planningHint: string;
};

/** Libellé UI d’un type de passage (délégué au formateur unique). */
export function formatPlannedRoundKindLabel(
  kind: RondePlannedRoundKind,
  randomPeriodMask?: number | null
): string {
  return formatRondePlannedRoundKind(kind, randomPeriodMask);
}

export function buildApplicablePlannedSlots(
  profiles: RondePlannedProfileRef[],
  dateIso: string,
  holidayDateIsos: string[] = []
): ApplicablePlannedSlot[] {
  const holidaysSet = new Set((holidayDateIsos || []).map((value) => String(value || "").trim()).filter(Boolean));
  const isHoliday = (iso: string) => holidaysSet.has(String(iso || "").trim());
  const isHolidayEve = (iso: string) => holidaysSet.has(addDaysIso(String(iso || "").trim(), 1));
  const raw: ApplicablePlannedSlot[] = [];
  for (const p of profiles) {
    if (p.createRoundsEnabled === false) continue;
    if (!p.siteId) continue;
    if (!profilePlanningAppliesOnDate(p, dateIso)) {
      /* Les lignes peuvent toutefois « déborder » depuis la veille (fenêtre aléatoire après minuit). */
    }
    const siteDisplay = p.siteDisplay?.trim() || "—";
    for (const line of p.lines) {
      if (line.roundKind === "OPENING" || line.roundKind === "CLOSING" || line.roundKind === "ACCOMPAGNEMENT") {
        if (!lineAndProfileApplyOnDate(p, line, dateIso, { isHoliday: isHoliday(dateIso), isHolidayEve: isHolidayEve(dateIso) })) continue;
        const rk = line.roundKind;
        const parts = [`Planifiée — ${formatPlannedRoundKindLabel(rk)}`, p.label];
        if (line.requestedTime) parts.push(`demande ${line.requestedTime}`);
        raw.push({
          siteId: p.siteId,
          siteDisplay,
          profileId: p.id,
          profileLabel: p.label,
          profileLineId: line.id,
          slotIndex: 0,
          slotKey: `${line.id}:0`,
          defaultIntervenantId: p.intervenantId ?? null,
          roundKind: rk,
          motifTypeId: line.motifTypeId,
          requestedTime: line.requestedTime,
          planningHint: parts.join(" — ")
        });
        continue;
      }
      if (line.roundKind === "RANDOM") {
        const anchors = randomAnchorDatesForTargetDay(p, line, dateIso, { isHoliday, isHolidayEve });
        for (const anchor of anchors) {
          const specs = generateRandomSlotSpecs(line, anchor);
          for (const spec of specs) {
            if (spec.calendarDateIso !== dateIso) continue;
            const parts = [`Planifiée — ${formatPlannedRoundKindLabel(spec.roundKind)}`, p.label];
            if (spec.requestedTime) parts.push(`demande ${spec.requestedTime}`);
            raw.push({
              siteId: p.siteId,
              siteDisplay,
              profileId: p.id,
              profileLabel: p.label,
              profileLineId: line.id,
              slotIndex: spec.slotIndex,
              slotKey: spec.slotKey,
              defaultIntervenantId: p.intervenantId ?? null,
              roundKind: spec.roundKind,
              motifTypeId: line.motifTypeId,
              requestedTime: spec.requestedTime,
              planningHint: parts.join(" — ")
            });
          }
        }
      }
    }
  }
  return raw;
}

export type SitePlannedRow = {
  siteId: string;
  siteDisplay: string;
  slots: ApplicablePlannedSlot[];
};

export function groupSlotsBySite(slots: ApplicablePlannedSlot[]): SitePlannedRow[] {
  const map = new Map<string, SitePlannedRow>();
  for (const s of slots) {
    if (!map.has(s.siteId)) {
      map.set(s.siteId, { siteId: s.siteId, siteDisplay: s.siteDisplay, slots: [] });
    }
    map.get(s.siteId)!.slots.push(s);
  }
  return [...map.values()].sort((a, b) => a.siteDisplay.localeCompare(b.siteDisplay, "fr"));
}
