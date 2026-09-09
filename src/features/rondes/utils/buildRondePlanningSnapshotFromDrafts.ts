/**
 * Snapshot planning v1 à partir des brouillons de la modale demande.
 */

import type { RondePlanningSnapshotV1 } from "../model/rondePlanningSnapshot.types";
import type { RequestOrigin } from "../model/requestOrigin";
import type { LineDraft } from "../model/rondeRequestLineDraft";

export type BuildRondePlanningSnapshotParams = {
  requestDate: string;
  requestTime: string;
  validFrom: string;
  validFromTime: string;
  validTo: string;
  validToTime: string;
  isSingleDay: boolean;
  origin: RequestOrigin;
  motifTypeId: string;
  consigne: string;
  siteId: string | null;
  intervenantId: string;
  lines: LineDraft[];
  originInterventionId: string | null;
};

export function buildRondePlanningSnapshotFromDrafts(
  params: BuildRondePlanningSnapshotParams
): RondePlanningSnapshotV1 {
  return {
    version: 1,
    requestDate: params.requestDate.trim(),
    requestTime: params.requestTime,
    validFrom: params.validFrom.trim(),
    validFromTime: params.validFromTime,
    validTo: params.validTo,
    validToTime: params.validToTime,
    isSingleDay: params.isSingleDay,
    origin: params.origin,
    motifTypeId: params.motifTypeId.trim(),
    consigne: params.consigne.trim(),
    siteId: params.siteId,
    intervenantId: params.intervenantId,
    createRoundsEnabled: true,
    lines: params.lines.map((ln) => ({
      roundKind: ln.roundKind,
      requestedTime: ln.requestedTime,
      randomWindowStart: ln.randomWindowStart,
      randomWindowEnd: ln.randomWindowEnd,
      randomRoundsCount: ln.randomRoundsCount,
      intervalHours: ln.intervalHours,
      intervalEndTime: params.validToTime,
      weekdaysMask: ln.weekdaysMask,
      includeHolidays: ln.includeHolidays,
      includeHolidayEves: ln.includeHolidayEves
    })),
    originInterventionId: params.originInterventionId
  };
}
