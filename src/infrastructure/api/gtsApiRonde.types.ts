/**
 * Signatures IPC rondes (saisies, lots, motifs, profils planifiés) pour `window.gtsApi`.
 *
 * Assemblées dans `src/vite-env.d.ts`. Tenir aligné avec `electron/preload.js`
 * et `gtsApiRonde.ts`.
 */

import type { Role } from "../../types";
import type {
  RondeBatchDeleteRequestRef,
  RondeEntry,
  RondeMotifTypeRef,
  RondeOriginKind,
  RondeSavePayload,
  RondeSource,
  RondeStatus
} from "../../features/rondes/model/ronde.types";
import type { RondePlannedProfilePayload, RondePlannedProfileRef } from "../../features/rondes/model/rondePlanned.types";

/** Canaux rondes du pont preload. */
export interface GtsApiRondeChannels {
      listRondes: (payload: { requesterRole: Role }) => Promise<RondeEntry[]>;
      getRondeTodayInProgressCounts: (payload: { requesterRole: Role; todayIso: string }) => Promise<{
        total: number;
        contractual: number;
        exceptional: number;
      }>;
      createRondeEntry: (payload: {
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
      } & RondeSavePayload) => Promise<RondeEntry>;
      updateRondeEntry: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        expectedUpdatedAt: string;
      } & RondeSavePayload) => Promise<RondeEntry>;
      setRondeStatus: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        expectedUpdatedAt: string;
        status: RondeStatus;
        cancellationReason?: string;
        cancellationKind?: "NON_EFFECTUEE" | "ANNULATION";
      }) => Promise<RondeEntry>;
      updateRondeBatchSharedFields: (payload: {
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
      }) => Promise<{ ok: boolean; updatedCount: number }>;
      bulkCancelRondeBatch: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        entryIds: string[];
        reason: string;
      }) => Promise<{ ok: boolean; cancelledCount: number; skippedCount: number }>;
      bulkDeleteRondeBatch: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        entryIds: string[];
        reason: string;
      }) => Promise<{
        ok: boolean;
        deletedCount: number;
        skippedCount: number;
        nonEffectueeCount?: number;
        suppressedCount?: number;
      }>;
      requestRondeBatchDelete: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        entryIds: string[];
        reason: string;
      }) => Promise<{ ok: boolean; requestBatchId: string; requestedAt: string; requestedBy: string; reason: string }>;
      reviewRondeBatchDeleteRequest: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        requestBatchId: string;
        decision: "approve" | "reject";
        reviewReason: string;
      }) => Promise<{
        ok: boolean;
        decision: "approve" | "reject";
        requestBatchId: string;
        deletedCount?: number;
        nonEffectueeCount?: number;
        suppressedCount?: number;
      }>;
      listRondeBatchDeleteRequests: (payload: {
        requesterRole: Role;
      }) => Promise<RondeBatchDeleteRequestRef[]>;
      listRondeMotifTypes: (payload: { requesterRole: Role }) => Promise<RondeMotifTypeRef[]>;
      createRondeMotifType: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        label: string;
        requiresFreeText: boolean;
        colorHex: string;
      }) => Promise<RondeMotifTypeRef>;
      updateRondeMotifType: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        label: string;
        requiresFreeText: boolean;
        colorHex: string;
        expectedUpdatedAt?: string | null;
      }) => Promise<RondeMotifTypeRef>;
      deleteRondeMotifType: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        reason: string;
      }) => Promise<{ success: boolean }>;
      listRondePlannedProfiles: (payload: { requesterRole: Role }) => Promise<RondePlannedProfileRef[]>;
      upsertRondePlannedProfile: (
        payload: {
          requesterRole: Role;
          requesterUsername: string;
          expectedUpdatedAt?: string | null;
        } & RondePlannedProfilePayload
      ) => Promise<RondePlannedProfileRef>;
      deleteRondePlannedProfile: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        reason: string;
        expectedUpdatedAt?: string | null;
      }) => Promise<{ success: boolean }>;
      requestRondePlannedProfileCancellation: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        reason: string;
        expectedUpdatedAt?: string | null;
      }) => Promise<RondePlannedProfileRef>;
      reviewRondePlannedProfileCancellationRequest: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        decision: "approve" | "reject";
        reviewReason: string;
        planningEndDate?: string;
        expectedUpdatedAt?: string | null;
      }) => Promise<RondePlannedProfileRef>;
      setRondePlannedProfilePlanningEnd: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        planningEndDate: string;
        reason: string;
        expectedUpdatedAt?: string | null;
      }) => Promise<RondePlannedProfileRef>;
      setRondePlannedProfileValidated: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        validated: boolean;
        expectedUpdatedAt?: string | null;
      }) => Promise<RondePlannedProfileRef>;
}
