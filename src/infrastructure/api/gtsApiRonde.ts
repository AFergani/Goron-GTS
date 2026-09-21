/**
 * Canaux IPC rondes (saisies, lots, motifs, profils planifiés) pour `gtsApiClient`.
 *
 * Appelé uniquement via la façade `gtsApiClient` (spread) : les features ne
 * importent pas ce module. Session injectée par `sessionCall`.
 */

import type { Role } from "../../types";
import type {
  RondeEntry,
  RondeMotifTypeRef,
  RondeOriginKind,
  RondeSavePayload,
  RondeSource,
  RondeStatus
} from "../../features/rondes/model/ronde.types";
import type { RondePlannedProfilePayload, RondePlannedProfileRef } from "../../features/rondes/model/rondePlanned.types";
import { sessionCall } from "./gtsApiSession";

/** Méthodes rondes assemblées dans `gtsApiClient`. */
export const gtsApiRondeMethods = {
  listRondes(payload: { requesterRole: Role }): Promise<RondeEntry[]> {
    return sessionCall(window.gtsApi.listRondes, payload);
  },
  getRondeTodayInProgressCounts(payload: { requesterRole: Role; todayIso: string }) {
    return sessionCall(window.gtsApi.getRondeTodayInProgressCounts, payload);
  },
  createRondeEntry(
    payload: {
      requesterRole: Role;
      requesterUsername: string;
      id: string;
      source: RondeSource;
      originInterventionId?: string | null;
      plannedProfileId?: string | null;
      plannedRoundKind?: string | null;
      plannedSlotKey?: string | null;
      initialStatus?: RondeStatus;
      cancellationReason?: string;
      requestPlanningSnapshotJson?: string | null;
      requestBatchId?: string | null;
    } & RondeSavePayload
  ) {
    return sessionCall(window.gtsApi.createRondeEntry, payload);
  },
  updateRondeEntry(
    payload: { requesterRole: Role; requesterUsername: string; id: string; expectedUpdatedAt: string } & RondeSavePayload
  ) {
    return sessionCall(window.gtsApi.updateRondeEntry, payload);
  },
  setRondeStatus(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    expectedUpdatedAt: string;
    status: RondeStatus;
    cancellationReason?: string;
    cancellationKind?: "NON_EFFECTUEE" | "ANNULATION";
  }) {
    return sessionCall(window.gtsApi.setRondeStatus, payload);
  },
  updateRondeBatchSharedFields(payload: {
    requesterRole: Role;
    requesterUsername: string;
    entryIds: string[];
    siteId: string | null;
    siteDisplay: string;
    motifTypeId: string;
    motifDetail: string;
    originKind: RondeOriginKind;
    originDetail: string;
    intervenantId: string | null;
    intervenantName: string;
    requestPlanningSnapshotJson?: string | null;
  }) {
    return sessionCall(window.gtsApi.updateRondeBatchSharedFields, payload);
  },
  bulkCancelRondeBatch(payload: { requesterRole: Role; requesterUsername: string; entryIds: string[]; reason: string }) {
    return sessionCall(window.gtsApi.bulkCancelRondeBatch, payload);
  },
  bulkDeleteRondeBatch(payload: { requesterRole: Role; requesterUsername: string; entryIds: string[]; reason: string }) {
    return sessionCall(window.gtsApi.bulkDeleteRondeBatch, payload);
  },
  requestRondeBatchDelete(payload: {
    requesterRole: Role;
    requesterUsername: string;
    entryIds: string[];
    reason: string;
  }) {
    return sessionCall(window.gtsApi.requestRondeBatchDelete, payload);
  },
  reviewRondeBatchDeleteRequest(payload: {
    requesterRole: Role;
    requesterUsername: string;
    requestBatchId: string;
    decision: "approve" | "reject";
    reviewReason: string;
  }) {
    return sessionCall(window.gtsApi.reviewRondeBatchDeleteRequest, payload);
  },
  listRondeBatchDeleteRequests(payload: { requesterRole: Role }) {
    return sessionCall(window.gtsApi.listRondeBatchDeleteRequests, payload);
  },
  listRondeMotifTypes(payload: { requesterRole: Role }): Promise<RondeMotifTypeRef[]> {
    return sessionCall(window.gtsApi.listRondeMotifTypes, payload);
  },
  createRondeMotifType(payload: {
    requesterRole: Role;
    requesterUsername: string;
    label: string;
    requiresFreeText: boolean;
    colorHex: string;
  }) {
    return sessionCall(window.gtsApi.createRondeMotifType, payload);
  },
  updateRondeMotifType(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    label: string;
    requiresFreeText: boolean;
    colorHex: string;
    expectedUpdatedAt?: string | null;
  }) {
    return sessionCall(window.gtsApi.updateRondeMotifType, payload);
  },
  deleteRondeMotifType(payload: { requesterRole: Role; requesterUsername: string; id: string; reason: string }) {
    return sessionCall(window.gtsApi.deleteRondeMotifType, payload);
  },
  listRondePlannedProfiles(payload: { requesterRole: Role }): Promise<RondePlannedProfileRef[]> {
    return sessionCall(window.gtsApi.listRondePlannedProfiles, payload);
  },
  upsertRondePlannedProfile(
    payload: { requesterRole: Role; requesterUsername: string; expectedUpdatedAt?: string | null } & RondePlannedProfilePayload
  ) {
    return sessionCall(window.gtsApi.upsertRondePlannedProfile, payload);
  },
  deleteRondePlannedProfile(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    reason: string;
    expectedUpdatedAt?: string | null;
  }) {
    return sessionCall(window.gtsApi.deleteRondePlannedProfile, payload);
  },
  requestRondePlannedProfileCancellation(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    reason: string;
    expectedUpdatedAt?: string | null;
  }) {
    return sessionCall(window.gtsApi.requestRondePlannedProfileCancellation, payload);
  },
  reviewRondePlannedProfileCancellationRequest(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    decision: "approve" | "reject";
    reviewReason: string;
    planningEndDate?: string;
    expectedUpdatedAt?: string | null;
  }) {
    return sessionCall(window.gtsApi.reviewRondePlannedProfileCancellationRequest, payload);
  },
  setRondePlannedProfilePlanningEnd(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    planningEndDate: string;
    reason: string;
    expectedUpdatedAt?: string | null;
  }) {
    return sessionCall(window.gtsApi.setRondePlannedProfilePlanningEnd, payload);
  },
  setRondePlannedProfileValidated(payload: {
    requesterRole: Role;
    requesterUsername: string;
    id: string;
    validated: boolean;
    expectedUpdatedAt?: string | null;
  }) {
    return sessionCall(window.gtsApi.setRondePlannedProfileValidated, payload);
  }
};
