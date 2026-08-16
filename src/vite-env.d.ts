/// <reference types="vite/client" />

/**
 * Déclarations TypeScript de `window.gtsApi` (API exposée par `electron/preload.js`).
 *
 * Miroir des canaux IPC vers le processus principal ; le client applicatif est
 * `src/infrastructure/api/gtsApiClient.ts` (jeton de session, garde d'expiration).
 * Tenir ce fichier aligné avec `preload.js` lors de l'ajout d'un canal.
 */

import type {
  LoginPayload,
  ManagerProfile,
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
import type {
  InterventionEntry,
  InterventionSavePayload,
  PendingInterventionIntervenant,
  PendingInterventionSite
} from "./features/intervention/model/intervention.types";
import type {
  RondeEntry,
  RondeMotifTypeRef,
  RondeOriginKind,
  RondeSavePayload,
  RondeSource,
  RondeStatus
} from "./features/rondes/model/ronde.types";
import type {
  RondeClosureFieldType,
  RondePlannedProfilePayload,
  RondePlannedProfileRef
} from "./features/rondes/model/rondePlanned.types";
import type { FormVariableDef, FormVariablePayload } from "./features/settings/model/formVariables.types";
import type {
  GardiennageClosePayload,
  GardiennageEntry,
  GardiennageSavePayload,
  GardiennageStatus
} from "./features/gardiennage/model/gardiennage.types";

declare global {
  interface Window {
    /** Pont preload Electron ; signatures des appels `ipcRenderer.invoke`. */
    gtsApi: {
      // --- Système : boot PG / mode dev, modèles Word, fenêtre ---
      getDbConfig: (payload?: { sessionToken?: string | null }) => Promise<{ configured: boolean; dbPath: string | null; isDev?: boolean }>;
      setDevToolsEnabled: (payload: { enabled: boolean; sessionToken?: string | null }) => Promise<{ success: boolean; enabled: boolean }>;
      getDocumentTemplate: (payload: {
        templateName: string;
      }) => Promise<{ found: boolean; dataBase64: string | null; sourcePath: string | null }>;
      listDocumentTemplates: (payload: { sessionToken: string }) => Promise<{
        templates: Array<{
          kind: "builtin" | "custom";
          templateKey: string;
          title: string;
          fileName: string;
          helpId: string;
          resolvedPath: string | null;
          exists: boolean;
          targetInstallPath: string | null;
        }>;
        writableTemplatesDir: string | null;
      }>;
      installDocumentTemplateCopy: (payload: {
        sessionToken: string;
        targetFileName: string;
      }) => Promise<{
        canceled: boolean;
        success: boolean;
        fileName?: string;
        resolvedPath?: string | null;
        templatesRelativePath?: string;
      }>;
      listTemplateAssignments: (payload: { sessionToken: string; requesterRole: Role }) => Promise<
        Array<{
          id: string;
          flowKind: "INTERVENTION" | "RONDE_EXCEPTIONNELLE" | "RONDE_PLANIFIEE" | "GARDIENNAGE";
          scopeKind: "SITE" | "FAMILLE";
          scopeValue: string;
          scopeLabel: string;
          templateFileName: string;
          createdAt: string;
          updatedAt: string;
        }>
      >;
      upsertScopedDocumentTemplate: (payload: {
        sessionToken: string;
        requesterRole: Role;
        requesterUsername: string;
        flowKind: "INTERVENTION" | "RONDE_EXCEPTIONNELLE" | "RONDE_PLANIFIEE" | "GARDIENNAGE";
        scopeKind: "SITE" | "FAMILLE";
        scopeValue: string;
        scopeLabel: string;
      }) => Promise<{
        canceled: boolean;
        success: boolean;
        fileName?: string;
        templatesRelativePath?: string;
        assignment?: {
          id: string;
          flowKind: "INTERVENTION" | "RONDE_EXCEPTIONNELLE" | "RONDE_PLANIFIEE" | "GARDIENNAGE";
          scopeKind: "SITE" | "FAMILLE";
          scopeValue: string;
          scopeLabel: string;
          templateFileName: string;
          createdAt: string;
          updatedAt: string;
        };
      }>;
      deleteTemplateAssignment: (payload: {
        sessionToken: string;
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        reason: string;
      }) => Promise<{ success: boolean }>;
      resolveTemplateFileForContext: (payload: {
        sessionToken: string;
        requesterRole: Role;
        flowKind: "INTERVENTION" | "RONDE_EXCEPTIONNELLE" | "RONDE_PLANIFIEE" | "GARDIENNAGE";
        siteId?: string | null;
        famille?: string | null;
      }) => Promise<{ templateFileName: string | null }>;
      openTemplatesFolder: (payload: {
        sessionToken: string;
      }) => Promise<{ success: boolean; path: string | null; error: string | null }>;
      getDbHealth: (payload?: { sessionToken?: string | null }) => Promise<{ configured: boolean; writable: boolean }>;
      getPostgresLabHealth: (payload?: { sessionToken?: string | null }) => Promise<{
        reachable: boolean;
        engine: "postgres";
        host: string;
        port: number;
        database: string;
        error: string | null;
        checkedAt: string;
        transition?: "none" | "lost" | "restored" | "unavailable_at_start";
      }>;
      getPostgresBootstrapStatus: (payload?: Record<string, never>) => Promise<{
        needsSetup: boolean;
        config: {
          host: string;
          port: number;
          database: string;
          user: string;
          hasPassword: boolean;
          source: "env" | "encrypted" | "defaults";
          encryptionAvailable: boolean;
          envOverridesActive: boolean;
        };
      }>;
      savePostgresBootstrapConfig: (payload: {
        host: string;
        port: number;
        database: string;
        user: string;
        password?: string;
      }) => Promise<{
        success: boolean;
        config: {
          host: string;
          port: number;
          database: string;
          user: string;
          hasPassword: boolean;
          source: "env" | "encrypted" | "defaults";
          encryptionAvailable: boolean;
          envOverridesActive: boolean;
        };
        reconnect: { success: boolean; reachable: boolean; error: string | null };
      }>;
      testPostgresBootstrapConfig: (payload: {
        host?: string;
        port?: number;
        database?: string;
        user?: string;
        password?: string;
      }) => Promise<{
        reachable: boolean;
        host: string;
        port: number;
        database: string;
        error: string | null;
        checkedAt: string;
      }>;
      getPostgresConfig: (payload: { sessionToken: string }) => Promise<{
        host: string;
        port: number;
        database: string;
        user: string;
        hasPassword: boolean;
        source: "env" | "encrypted" | "defaults";
        encryptionAvailable: boolean;
        envOverridesActive: boolean;
      }>;
      savePostgresConfig: (payload: {
        sessionToken: string;
        requesterRole: Role;
        requesterUsername: string;
        host: string;
        port: number;
        database: string;
        user: string;
        password?: string;
      }) => Promise<{
        success: boolean;
        config: {
          host: string;
          port: number;
          database: string;
          user: string;
          hasPassword: boolean;
          source: "env" | "encrypted" | "defaults";
          encryptionAvailable: boolean;
          envOverridesActive: boolean;
        };
        reconnect: { success: boolean; reachable: boolean; error: string | null };
      }>;
      testPostgresConfig: (payload: {
        sessionToken: string;
        requesterRole: Role;
        requesterUsername: string;
        host?: string;
        port?: number;
        database?: string;
        user?: string;
        password?: string;
      }) => Promise<{
        reachable: boolean;
        host: string;
        port: number;
        database: string;
        error: string | null;
        checkedAt: string;
      }>;
      reconnectPostgres: (payload: {
        sessionToken: string;
        requesterRole: Role;
        requesterUsername: string;
      }) => Promise<{ success: boolean; reachable: boolean; error: string | null }>;
      quitApp: (payload?: { sessionToken?: string | null }) => Promise<{ success: boolean }>;
      minimizeApp: (payload?: { sessionToken?: string | null }) => Promise<{ success: boolean }>;
      subscribeAppExitChoiceRequest: (callback: () => void) => () => void;

      // --- Authentification et comptes ---
      login: (payload: LoginPayload) => Promise<{ user: User; sessionToken: string }>;
      getAdminAccessStatus: () => Promise<{ enabled: boolean }>;
      firstLogin: (payload: {
        username: string;
        temporaryPassword: string;
        newPassword: string;
      }) => Promise<{ success: boolean }>;
      logout: (payload: { sessionToken: string }) => Promise<{ success: boolean }>;
      unlockUser: (payload: { requesterRole: Role; requesterUsername: string; sessionToken: string; username: string }) => Promise<{ success: boolean }>;
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
        managerProfile: ManagerProfile | null;
        pageAccess: PageAccess;
      }) => Promise<{ user: User; temporaryPassword: string }>;
      updateUserProfile: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        username: string;
        fullName: string;
        newRole: Exclude<Role, "DEV">;
        managerProfile: ManagerProfile | null;
        pageAccess: PageAccess;
        mustResetPassword: boolean;
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
      }) => Promise<{ success: boolean }>;
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
        auditMode?: "single" | "batch";
      }) => Promise<{ success: boolean }>;
      deleteIntervenant: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
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
      markMainCouranteEntryConsulted: (payload: {
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
      createInterventionEntry: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
      } & InterventionSavePayload) => Promise<InterventionEntry>;
      updateInterventionEntry: (payload: {
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
      setInterventionBillingStatus: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        expectedUpdatedAt: string;
        billingStatus: "FACTURABLE" | "NON_FACTURABLE";
        reason?: string;
      }) => Promise<InterventionEntry>;
      listPendingInterventionSites: (payload: { requesterRole: Role }) => Promise<PendingInterventionSite[]>;
      createPendingInterventionSite: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        code: string;
        name: string;
      }) => Promise<{ success: boolean; alreadyExists: boolean }>;
      resolvePendingInterventionSite: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        pendingId: string;
        parc: string;
        famille: string;
      }) => Promise<{
        success: boolean;
        siteId: string;
        alreadyExists: boolean;
        propagation?: { interventionEntries: number; rondeEntries: number; gardiennageEntries: number; mainCouranteEntries: number };
      }>;
      deletePendingInterventionSite: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        pendingId: string;
        reason: string;
      }) => Promise<{ success: boolean }>;
      listPendingInterventionIntervenants: (payload: { requesterRole: Role }) => Promise<PendingInterventionIntervenant[]>;
      createPendingInterventionIntervenant: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        name: string;
      }) => Promise<{ success: boolean; alreadyExists: boolean }>;
      resolvePendingInterventionIntervenant: (payload: {
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
      deletePendingInterventionIntervenant: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        pendingId: string;
        reason: string;
      }) => Promise<{ success: boolean }>;
      // --- Rondes ---
      listRondes: (payload: { requesterRole: Role }) => Promise<RondeEntry[]>;
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
      }) => Promise<{ ok: boolean; deletedCount: number; skippedCount: number }>;
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
      }) => Promise<RondeMotifTypeRef>;
      deleteRondeMotifType: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        reason: string;
      }) => Promise<{ success: boolean }>;
      listRondePlannedProfiles: (payload: { requesterRole: Role }) => Promise<RondePlannedProfileRef[]>;
      upsertRondePlannedProfile: (
        payload: { requesterRole: Role; requesterUsername: string } & RondePlannedProfilePayload
      ) => Promise<RondePlannedProfileRef>;
      deleteRondePlannedProfile: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        reason: string;
      }) => Promise<{ success: boolean }>;
      setRondePlannedProfilePlanningEnd: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        planningEndDate: string;
        reason: string;
      }) => Promise<RondePlannedProfileRef>;
      setRondePlannedProfileValidated: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        id: string;
        validated: boolean;
      }) => Promise<RondePlannedProfileRef>;
      listInterventionWordExtraFields: (payload: { requesterRole: Role }) => Promise<
        Array<{
          id: string;
          sortOrder: number;
          fieldKey: string;
          label: string;
          fieldType: RondeClosureFieldType;
          placeholder: string;
          options: string[];
          createdAt: string;
          updatedAt: string;
        }>
      >;
      // --- Variables de formulaire ---
      listFormVariables: (payload: { requesterRole: Role }) => Promise<FormVariableDef[]>;
      saveFormVariables: (payload: {
        requesterRole: Role;
        requesterUsername: string;
        variables: FormVariablePayload[];
      }) => Promise<FormVariableDef[]>;
      // --- Gardiennage ---
      listGardiennages: (payload: { sessionToken: string; requesterRole: Role }) => Promise<GardiennageEntry[]>;
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
        id: string;
        expectedUpdatedAt: string;
        status: GardiennageStatus;
        cancellationReason?: string;
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
