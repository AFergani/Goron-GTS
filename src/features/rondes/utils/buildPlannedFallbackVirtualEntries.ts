/**
 * Créneaux planifiés virtuels (pas encore de fiche) pour la liste contractuelle.
 */

import type { HolidayRef, IntervenantRef } from "../../../types";
import type { RondeEntry } from "../model/ronde.types";
import type { RondePlannedProfileRef } from "../model/rondePlanned.types";
import { buildApplicablePlannedSlots } from "../model/plannedSlots";
import { enumerateInclusiveDateIsos, findPlannedEntryForSlot } from "./rondeDateTime";

export function buildPlannedFallbackVirtualEntries(params: {
  entries: RondeEntry[];
  profiles: RondePlannedProfileRef[];
  holidays: HolidayRef[];
  intervenants: IntervenantRef[];
  dateFrom: string;
  dateTo: string;
}): RondeEntry[] {
  const dateRange = enumerateInclusiveDateIsos(params.dateFrom, params.dateTo);
  if (!dateRange.length) return [];
  const holidayDateIsos = params.holidays.map((h) => h.dateIso);
  const intervenantById = new Map(params.intervenants.map((i) => [i.id, i.name]));
  const existingPlannedByDate = new Map<string, RondeEntry[]>();
  for (const entry of params.entries) {
    if (entry.source !== "PLANIFIE") continue;
    const current = existingPlannedByDate.get(entry.requestDate);
    if (current) current.push(entry);
    else existingPlannedByDate.set(entry.requestDate, [entry]);
  }
  const virtualRows: RondeEntry[] = [];
  for (const dateIso of dateRange) {
    const daySlots = buildApplicablePlannedSlots(params.profiles, dateIso, holidayDateIsos);
    const dayEntries = existingPlannedByDate.get(dateIso) || [];
    daySlots
      .filter((slot) => !findPlannedEntryForSlot(dayEntries, dateIso, slot))
      .forEach((slot, index) => {
        virtualRows.push({
          id: `virtual-planned-${dateIso}-${slot.profileId}-${slot.slotKey}-${index}`,
          createdAt: "",
          updatedAt: "",
          source: "PLANIFIE",
          originInterventionId: null,
          siteId: slot.siteId,
          siteDisplay: slot.siteDisplay,
          requestDate: dateIso,
          motifTypeId: slot.motifTypeId,
          motifTypeLabel: "",
          motifRequiresFreeText: false,
          motifDetail: "",
          horairesDemandeObs: slot.planningHint || "",
          originKind: "TELESURVEILLANCE",
          originDetail: "Planifiée",
          intervenantId: slot.defaultIntervenantId,
          intervenantName: slot.defaultIntervenantId ? intervenantById.get(slot.defaultIntervenantId) || "" : "",
          arrivalTime: "",
          departureTime: "",
          arrivalDate: null,
          departureDate: null,
          durationMinutes: null,
          workOrderNumber: "",
          report: "",
          status: "EN_COURS",
          cancellationReason: "",
          cancellationKind: null,
          closedAt: null,
          plannedProfileId: slot.profileId,
          plannedRoundKind: slot.roundKind,
          plannedSlotKey: slot.slotKey,
          closureCustomValues: {},
          requestPlanningSnapshot: null,
          requestBatchId: null,
          requestPlanningSnapshotJson: null,
          batchSuppressedAt: null,
          batchSuppressedBy: null,
          batchSuppressedReason: "",
          batchDeleteRequestedAt: null,
          batchDeleteRequestedBy: null,
          batchDeleteReason: "",
          dailyCode: ""
        });
      });
  }
  return virtualRows;
}
