/**
 * Snapshot de planification minimal pour rouvrir une demande liée (anciens lots).
 */

import type { RondeOriginKind } from "../model/ronde.types";
import type { RondePlanningSnapshotV1 } from "../model/rondePlanningSnapshot.types";
import {
  requestOriginFromStoredEntry,
  stripSuiteInterventionPrefix
} from "../model/requestOrigin";
import { createDefaultLineDraft } from "../model/rondeRequestLineDraft";

export function syntheticPlanningSnapshotForLinkedDemand(row: {
  requestDate: string;
  motifTypeId: string | null;
  horairesDemandeObs: string;
  siteId: string | null;
  intervenantId: string | null;
  originInterventionId?: string | null;
  originKind?: RondeOriginKind;
  originDetail?: string;
}): RondePlanningSnapshotV1 {
  const origin = requestOriginFromStoredEntry(row);
  const rawDetail = String(row.originDetail ?? row.horairesDemandeObs ?? "").trim();
  const consigne = origin === "SUITE_INTERVENTION" ? stripSuiteInterventionPrefix(rawDetail) : rawDetail;
  const defaultLine = createDefaultLineDraft();
  return {
    version: 1,
    requestDate: row.requestDate,
    requestTime: "00:00",
    validFrom: row.requestDate,
    validTo: "",
    origin,
    motifTypeId: String(row.motifTypeId ?? "").trim(),
    consigne,
    siteId: row.siteId ?? null,
    intervenantId: String(row.intervenantId ?? ""),
    createRoundsEnabled: true,
    lines: [
      {
        roundKind: defaultLine.roundKind,
        requestedTime: defaultLine.requestedTime,
        randomWindowStart: defaultLine.randomWindowStart,
        randomWindowEnd: defaultLine.randomWindowEnd,
        randomRoundsCount: defaultLine.randomRoundsCount,
        intervalHours: defaultLine.intervalHours,
        intervalEndTime: defaultLine.intervalEndTime,
        weekdaysMask: defaultLine.weekdaysMask,
        includeHolidays: defaultLine.includeHolidays,
        includeHolidayEves: defaultLine.includeHolidayEves
      }
    ],
    originInterventionId: row.originInterventionId ?? null
  };
}
