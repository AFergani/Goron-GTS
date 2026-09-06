/**
 * Snapshot de planification minimal pour rouvrir une demande liée (anciens lots).
 */

import type { RondeOriginKind } from "../model/ronde.types";
import type { RondePlanningSnapshotV1 } from "../model/rondePlanningSnapshot.types";
import { requestOriginFromStoredEntry } from "../model/requestOrigin";

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
  const suitePrefix = /^Suite intervention\.\s*/i;
  const consigne = origin === "SUITE_INTERVENTION" ? rawDetail.replace(suitePrefix, "").trim() : rawDetail;
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
        roundKind: "OPENING",
        requestedTime: "08:00",
        randomWindowStart: "",
        randomWindowEnd: "",
        randomRoundsCount: "",
        intervalHours: "",
        intervalEndTime: "23:59",
        weekdaysMask: 0,
        includeHolidays: false,
        includeHolidayEves: false
      }
    ],
    originInterventionId: row.originInterventionId ?? null
  };
}
