/// <reference types="vite/client" />

/**
 * Déclarations TypeScript de `window.gtsApi` (API exposée par `electron/preload.js`).
 *
 * Miroir des canaux IPC vers le processus principal ; le client applicatif est
 * `src/infrastructure/api/gtsApiClient.ts` (jeton de session, garde d'expiration).
 * Canaux système, PostgreSQL et rondes : `gtsApiSystem.types.ts`, `gtsApiRonde.types.ts`.
 * Tenir ce fichier aligné avec `preload.js` lors de l'ajout d'un canal.
 */

import type { GtsApiSystemChannels } from "./infrastructure/api/gtsApiSystem.types";
import type { GtsApiRondeChannels } from "./infrastructure/api/gtsApiRonde.types";
import type {
  LoginPayload,
  BusinessProfile,
  PageAccess,
  User,
  Role,
  AuditLog,
  SiteRef,
  HolidayRef,
  IntervenantRef,
  AnomalyTypeRef,
  FransorResponsableRef,
  FransorClosure,
  FransorEntry,
  FransorMonthlyRecap
} from "./types";
import type { MainCouranteEntry, MainCouranteSavePayload } from "./features/mainCourante/model/mainCourante.types";
import type { InterventionEntry, InterventionSavePayload } from "./features/intervention/model/intervention.types";
import type { PendingIntervenant, PendingSite } from "./features/common/model/pendingRefs.types";
import type { FormVariableDef, FormVariableDeletion, FormVariablePayload } from "./features/settings/model/formVariables.types";
import type { VideoRemarkDocument } from "./features/videoRemarks/model/videoRemarkTypes";
import type { PvVideoForm, PvVideoImage } from "./features/pvVideo/model/pvVideoForm";
import type {
  GardiennageClosePayload,
  GardiennageEntry,
  GardiennageSavePayload,
  GardiennageStatus
} from "./features/gardiennage/model/gardiennage.types";

declare global {
  interface Window {
    /** Pont preload Electron ; signatures des appels `ipcRenderer.invoke`. */
    gtsApi: GtsApiSystemChannels & GtsApiRondeChannels & {
      // --- Authentification et comptes ---
      login: (payload: LoginPayload) => Promise<{ user: User; sessionToken: string }>;
      firstLogin: (payload: {
        username: string;
        temporaryPassword: string;
        newPassword: string;
      }) => Promise<{ success: boolean }>;
      /** Réinitialisation d'un mot de passe oublié, validée par un collègue présent. */
      resetPasswordWithPeer: (payload: {
        fullName: string;
        validatorFullName: string;
        validatorPassword: string;
        reason: string;
      }) => Promise<{ success: boolean; fullName: string; temporaryPassword: string }>;
      logout: (payload: { sessionToken: string }) => Promise<{ success: boolean }>;
      unlockUser: (payload: { requesterRole: Role; requesterUsername: string; sessionToken: string; username: string; reason: string }) => Promise<{ success: boolean }>;
      getActiveSessions: (payload: { sessionToken: string }) => Promise<{ activeUsernames: string[] }>;
      touchPresence: (payload: { sessionToken: string }) => Promise<{ written: boolean }>;
      setAdminCode: (payload: { requesterRole: Role; requesterUsername: string; sessionToken: string; code: string }) => Promise<{ success: boolean }>;
      listUsers: (payload: { requesterRole: Role; requesterUsername: string }) => Promise<User[]>;
      createUser: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        username: string;
        fullName: string;
        role: Exclude<Role, "DEV">;
        managerProfile: BusinessProfile | null;
        pageAccess: PageAccess;
      }) => Promise<{ user: User; temporaryPassword: string }>;
      updateUserProfile: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        username: string;
        fullName: string;
        newRole: Exclude<Role, "DEV">;
        managerProfile: BusinessProfile | null;
        pageAccess: PageAccess;
        mustResetPassword: boolean;
        /** Motif obligatoire tracé dans le journal des actions. */
        reason: string;
        expectedUpdatedAt?: string | null;
      }) => Promise<{ success: boolean; temporaryPassword: string | null; fullName?: string }>;
      deactivateUser: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        username: string;
        reason: string;
      }) => Promise<{ success: boolean }>;
      reactivateUser: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        username: string;
        reason: string;
        fullName?: string;
      }) => Promise<{ success: boolean; temporaryPassword: string; fullName?: string }>;
      // --- Audit et préférences ---
      listAuditLogs: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        limit?: number;
      }) => Promise<AuditLog[]>;
      getAuditMetadata: (payload: {
        requesterRole: Role;
        requesterUsername: string;
      }) => Promise<{ firstOccurredAt: string | null; lastOccurredAt: string | null; total: number }>;
      listTechErrorLogs: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        limit?: number;
      }) => Promise<
        Array<{
          occurredAt: string;
          source: string;
          code: string;
          codeLabel: string;
          messageFr: string;
          details: Record<string, unknown> | null;
        }>
      >;
      logBulkImportAudit: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        target: "sites" | "intervenants" | "types";
        fileName: string;
        total: number;
        success: number;
        failed: number;
        errorEntries: Array<{ rowIndex: number; message: string; row: Record<string, unknown> }>;
      }) => Promise<{ success: boolean }>;
      getUserPreferences: (payload: { requesterRole: Role; requesterUsername: string }) => Promise<{ themeMode: "dark" | "light" }>;
      setUserPreferences: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        themeMode: "dark" | "light";
      }) => Promise<{ success: boolean; themeMode: "dark" | "light" }>;
      // --- Référentiels ---
      listSites: (payload: { requesterRole: Role }) => Promise<SiteRef[]>;
      getVideoRemarkSnapshot: (payload: {
        requesterRole: Role;
        siteId: string;
      }) => Promise<{ updatedAt: string; payload: VideoRemarkDocument } | null>;
      saveVideoRemarkSnapshot: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        siteId: string;
        expectedUpdatedAt: string | null;
        document: VideoRemarkDocument;
      }) => Promise<{ updatedAt: string }>;
      getPvVideoReport: (payload: {
        requesterRole: Role;
        siteId: string;
      }) => Promise<{
        updatedAt: string | null;
        archiveConfigured: boolean;
        form: PvVideoForm | null;
        image: PvVideoImage | null;
      }>;
      savePvVideoReport: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        siteId: string;
        expectedUpdatedAt: string | null;
        form: PvVideoForm;
        image: PvVideoImage | null;
        imageChanged: boolean;
      }) => Promise<{ updatedAt: string; snapshotSaved: boolean }>;
      setPvVideoArchiveFolder: (payload: {
        requesterRole: Role;
        requesterUsername: string;
      }) => Promise<{ canceled: boolean; archiveConfigured: boolean }>;
      archivePvVideoExport: (payload: {
        requesterRole: Role;
        siteId: string;
        sourcePath: string;
      }) => Promise<{ backedUp: boolean; reason: string }>;
      listPvVideoSnapshots: (payload: {
        requesterRole: Role;
        siteId: string;
      }) => Promise<{ snapshots: { version: number; savedAt: string; savedBy: string }[] }>;
      loadPvVideoSnapshot: (payload: {
        requesterRole: Role;
        siteId: string;
        savedAt: string;
      }) => Promise<{
        version: number;
        savedAt: string;
        form: PvVideoForm;
        image: PvVideoImage | null;
      }>;
      createSite: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        code: string;
        name: string;
        address?: string;
        parc?: string;
        famille?: string;
        auditMode?: "single" | "batch";
      }) => Promise<{ success: boolean }>;
      updateSite: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        code: string;
        name: string;
        address?: string;
        parc?: string;
        famille?: string;
        expectedUpdatedAt?: string | null;
        auditMode?: "single" | "batch";
      }) => Promise<{ success: boolean }>;
      deleteSite: (payload: { requesterRole: Role; requesterUsername: string; id: string; reason: string }) => Promise<{ success: boolean }>;
      listIntervenants: (payload: { requesterRole: Role }) => Promise<IntervenantRef[]>;
      createIntervenant: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        name: string;
        auditMode?: "single" | "batch";
      }) => Promise<{ success: boolean }>;
      updateIntervenant: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        name: string;
        expectedUpdatedAt?: string | null;
        auditMode?: "single" | "batch";
      }) => Promise<{ success: boolean }>;
      deleteIntervenant: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        reason: string;
      }) => Promise<{ success: boolean }>;
      listPendingSites: (payload: { requesterRole: Role }) => Promise<PendingSite[]>;
      createPendingSite: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        code: string;
        name: string;
      }) => Promise<{ success: boolean; alreadyExists: boolean; existsIn?: "catalog" | "pending" }>;
      resolvePendingSite: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        pendingId: string;
        parc: string;
        famille: string;
        address?: string;
      }) => Promise<{
        success: boolean;
        siteId: string;
        alreadyExists: boolean;
        propagation?: { interventionEntries: number; rondeEntries: number; gardiennageEntries: number; mainCouranteEntries: number };
      }>;
      deletePendingSite: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        pendingId: string;
        reason: string;
      }) => Promise<{ success: boolean }>;
      listPendingIntervenants: (payload: { requesterRole: Role }) => Promise<PendingIntervenant[]>;
      createPendingIntervenant: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        name: string;
      }) => Promise<{ success: boolean; alreadyExists: boolean }>;
      resolvePendingIntervenant: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        pendingId: string;
        name?: string;
      }) => Promise<{
        success: boolean;
        intervenantId: string;
        alreadyExists: boolean;
        propagation?: { interventionEntries: number; rondeEntries: number; gardiennageEntries: number };
      }>;
      deletePendingIntervenant: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        pendingId: string;
        reason: string;
      }) => Promise<{ success: boolean }>;
      listAnomalyTypes: (payload: { requesterRole: Role }) => Promise<AnomalyTypeRef[]>;
      createAnomalyType: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        label: string;
        colorHex?: string;
        auditMode?: "single" | "batch";
      }) => Promise<{ success: boolean }>;
      updateAnomalyType: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        label: string;
        colorHex?: string;
        expectedUpdatedAt?: string | null;
        auditMode?: "single" | "batch";
      }) => Promise<{ success: boolean }>;
      deleteAnomalyType: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        reason: string;
      }) => Promise<{ success: boolean }>;
      listHolidays: (payload: { requesterRole: Role }) => Promise<HolidayRef[]>;
      createHoliday: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        dateIso: string;
        label: string;
      }) => Promise<{ success: boolean }>;
      updateHoliday: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        dateIso: string;
        label: string;
        expectedUpdatedAt?: string | null;
      }) => Promise<{ success: boolean }>;
      deleteHoliday: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        reason: string;
      }) => Promise<{ success: boolean }>;
      // --- Fransor ---
      listFransorResponsables: (payload: { requesterRole: Role }) => Promise<FransorResponsableRef[]>;
      createFransorResponsable: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        name: string;
      }) => Promise<{ success: boolean }>;
      updateFransorResponsable: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        name: string;
        expectedUpdatedAt?: string | null;
      }) => Promise<{ success: boolean }>;
      deleteFransorResponsable: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        reason: string;
      }) => Promise<{ success: boolean }>;
      listFransorClosures: (payload: { requesterRole: Role; month: string }) => Promise<FransorClosure[]>;
      upsertFransorClosure: (payload: {
        id?: string;
        requesterRole: Role;
        requesterUsername: string;
        startDate: string;
        endDate?: string;
        label: string;
        mode: "CLOSED" | "OPEN";
      }) => Promise<{ success: boolean }>;
      deleteFransorClosure: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        reason: string;
      }) => Promise<{ success: boolean }>;
      listFransorEntriesByMonth: (payload: { requesterRole: Role; month: string }) => Promise<FransorEntry[]>;
      upsertFransorEntry: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        date: string;
        responsableId: string;
        ouvertureDone: boolean;
        fermetureDone: boolean;
      }) => Promise<{ success: boolean }>;
      listFransorMonthlyRecap: (payload: { requesterRole: Role; month: string }) => Promise<FransorMonthlyRecap[]>;
      // --- Main courante ---
      listMainCouranteEntries: (payload: { requesterRole: Role }) => Promise<MainCouranteEntry[]>;
      getMainCouranteUnconsultedCount: (payload: { requesterRole: Role }) => Promise<{ count: number }>;
      getMainCouranteOperatorResponseCount: (payload: { requesterRole: Role }) => Promise<{ count: number }>;
      markMainCouranteEntryConsulted: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
      }) => Promise<{ success: boolean }>;
      markMainCouranteEntryConsultedByOperator: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
      }) => Promise<{ success: boolean }>;
      createMainCouranteEntry: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        operatorName: string;
        siteId: string | null;
        siteDisplay: string;
        anomalyTypeId: string;
        anomalyTypeLabel: string;
        information: string;
        exportExtraValues?: Record<string, string>;
      }) => Promise<MainCouranteEntry>;
      updateMainCouranteEntryOperator: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        expectedUpdatedAt: string;
        requesterFullName: string;
      } & MainCouranteSavePayload) => Promise<MainCouranteEntry>;
      applyMainCouranteManagerAction: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        expectedUpdatedAt: string;
        managerName: string;
        managerObservation: string;
        decision: "suivre" | "cloture";
        exportExtraValues?: Record<string, string>;
      }) => Promise<MainCouranteEntry>;
      reopenMainCouranteEntry: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        expectedUpdatedAt: string;
        managerName: string;
      }) => Promise<MainCouranteEntry>;
      // --- Interventions ---
      listInterventions: (payload: { requesterRole: Role }) => Promise<InterventionEntry[]>;
      getInterventionOpenCount: (payload: { requesterRole: Role }) => Promise<{ count: number }>;
      createIntervention: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
      } & InterventionSavePayload) => Promise<InterventionEntry>;
      updateIntervention: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        expectedUpdatedAt: string;
      } & InterventionSavePayload) => Promise<InterventionEntry>;
      setInterventionStatus: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        expectedUpdatedAt: string;
        status: "EN_COURS" | "CLOTURE" | "ANNULE";
        cancellationReason?: string;
      }) => Promise<InterventionEntry>;
      // --- Variables de formulaire ---
      listFormVariables: (payload: { requesterRole: Role }) => Promise<FormVariableDef[]>;
      saveFormVariables: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        variables: FormVariablePayload[];
        deletions?: FormVariableDeletion[];
      }) => Promise<FormVariableDef[]>;
      // --- Gardiennage ---
      listGardiennages: (payload: { sessionToken: string; requesterRole: Role }) => Promise<GardiennageEntry[]>;
      getGardiennageTodayInProgressCount: (payload: { requesterRole: Role; todayIso: string }) => Promise<{ count: number }>;
      createGardiennage: (payload: {
        sessionToken: string;
        requesterRole: Role;
        requesterUsername: string;
        id: string;
      } & GardiennageSavePayload) => Promise<GardiennageEntry>;
      updateGardiennage: (payload: {
        sessionToken: string;
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        expectedUpdatedAt: string;
      } & GardiennageSavePayload) => Promise<GardiennageEntry>;
      setGardiennageStatus: (payload: {
        sessionToken: string;
        requesterRole: Role;
        requesterUsername: string;
        requesterDisplayName?: string;
        id: string;
        expectedUpdatedAt: string;
        status: GardiennageStatus;
        cancellationReason?: string;
      }) => Promise<GardiennageEntry>;
      requestGardiennageCancellation: (payload: {
        sessionToken: string;
        requesterRole: Role;
        requesterUsername: string;
        requesterDisplayName?: string;
        id: string;
        reason: string;
      }) => Promise<GardiennageEntry>;
      reviewGardiennageCancellation: (payload: {
        sessionToken: string;
        requesterRole: Role;
        requesterUsername: string;
        requesterDisplayName?: string;
        id: string;
        decision: "approve" | "reject";
      }) => Promise<GardiennageEntry>;
      deleteGardiennage: (payload: {
        sessionToken: string;
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        reason: string;
      }) => Promise<{ success: boolean; batchId?: string | null; deletedCount?: number; preservedClosedCount?: number }>;
      closeGardiennage: (payload: {
        sessionToken: string;
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        expectedUpdatedAt: string;
      } & GardiennageClosePayload) => Promise<GardiennageEntry>;
      reopenGardiennage: (payload: {
        sessionToken: string;
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        expectedUpdatedAt: string;
      }) => Promise<GardiennageEntry>;
    };
  }
}

export {};
